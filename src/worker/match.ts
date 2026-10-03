import { DurableObject } from "cloudflare:workers";
import * as z from "zod/mini";
import { generateRosco } from "../clues/generate";
import {
  act,
  addRosco,
  devicesChanged,
  listening,
  missingRoscos,
  newMatch,
  nextChange,
  rematch,
  silent,
  answersInMatch,
  tick,
  viewFor,
  type MatchState,
} from "../rules/match";
import {
  deviceKeySchema,
  parseAction,
  parseDeviceKey,
  PING,
  PING_MS,
  PONG,
  type Creator,
  type DeviceKey,
  type Rejection,
  type ServerMessage,
  type Settings,
} from "../shared/protocol";
import { generation } from "./providers";
import { stockOf } from "./stock";

// WebSocket close codes (RFC 6455, section 7.4.1).
const NORMAL_CLOSURE = 1000;
/**
 * Codes that report what happened to a connection but that no endpoint may
 * send: no code given (1005), the connection broke with no close frame
 * (1006), and a failed TLS handshake (1015).
 */
const RESERVED_CLOSE_CODES: readonly number[] = [1005, 1006, 1015];

const STATE_KEY = "state";
/** When the alarm was last set for, in epoch milliseconds. */
const ALARM_KEY = "alarm";
/** When the next heartbeat check is due, in epoch milliseconds; none while the Match isn't listening. */
const CHECK_KEY = "check";

/**
 * How often the Match checks which Devices still ping while it listens for
 * Devices going silent. Longer than PING_MS, so every check finds a new
 * ping from each Device that is still there.
 */
const CHECK_MS = Math.max(5000, PING_MS + 1000);

/** What the Match keeps on each socket. */
const attachmentSchema = z.object({
  device: deviceKeySchema,
  /**
   * When it was last heard from, in the Match's time: when it connected, or
   * when it sent the last ping a heartbeat check found.
   */
  heard: z.number(),
  /** When the last heartbeat check looked at it, by this clock; pings since are new. */
  checked: z.number(),
});
type Attachment = z.infer<typeof attachmentSchema>;

/** How long to wait before generating a Match's Roscos again when every model failed. */
const GENERATION_RETRY_MS = 60_000;

/**
 * One Match: owns its state and the WebSockets of the Devices following it
 * (ADR 0002). Uses the WebSocket Hibernation API, so the connected Devices
 * are the sockets the runtime holds for this object, each tagged with its
 * DeviceKey. The rules live in `../rules`; this class only loads and
 * stores state, validates messages and broadcasts.
 */
export class Match extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // The runtime answers pings itself, so they don't wake the Match.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
  }

  /**
   * Sets the Match up; the Worker calls it once, right after issuing the id.
   * Takes its Roscos from the Stock, and generates any the Stock didn't have.
   */
  async create(
    settings: Settings,
    creator: Creator,
  ): Promise<Rejection | null> {
    const result = newMatch(settings, creator);
    // Only a Match that exists takes Roscos, so a refused one wastes none.
    if (!result.ok) return result.reason;
    await this.setUp(result.state);
    return null;
  }

  /**
   * Sets the Match up as the Rematch of one that has ended; that Match calls
   * it once, right after issuing the id.
   */
  async createRematch(state: MatchState): Promise<void> {
    await this.setUp(state);
  }

  /** Takes the Match's Roscos from the Stock, and generates any it didn't have. */
  private async setUp(created: MatchState): Promise<void> {
    let state = created;
    const roscos = await stockOf(this.env).take(
      state.settings.difficulty,
      missingRoscos(state),
    );
    for (const rosco of roscos) state = addRosco(state, rosco, Date.now());
    this.save(state);
    if (missingRoscos(state) > 0) await this.setAlarm(Date.now());
  }

  /**
   * Generates the Roscos the Stock couldn't give while any are missing;
   * once they are all here, applies the change time has brought: the end of
   * a countdown or Handover, a Clock reaching zero, or Devices gone silent.
   */
  override async alarm(): Promise<void> {
    const state = this.load();
    if (!state) return;
    if (missingRoscos(state) > 0) await this.generateRoscos(state);
    else await this.passTime(state);
  }

  /**
   * Generates the missing Roscos, both at once so the Players wait for one
   * generation, not two, each avoiding the answers of a Rosco the Match
   * already has. Keeps any that succeed. Two generated together may still
   * share an answer, and then the second is refused: the next alarm, right
   * away, generates one that avoids the first. When a model failed it tries
   * again a minute later. The first Turn can't begin until both are here.
   */
  private async generateRoscos(before: MatchState): Promise<void> {
    const avoid = answersInMatch(before);
    const results = await Promise.allSettled(
      Array.from({ length: missingRoscos(before) }, () =>
        generateRosco(before.settings.difficulty, generation(this.env), avoid),
      ),
    );
    // Members may have joined while the Roscos were being generated.
    let state = this.load() ?? before;
    let failed = false;
    for (const result of results) {
      if (result.status === "fulfilled") {
        state = addRosco(state, result.value, Date.now());
      } else {
        failed = true;
        console.error("Couldn't generate a Rosco", result.reason);
      }
    }
    this.save(state);
    this.broadcast(state, this.sockets());
    if (missingRoscos(state) > 0) {
      await this.setAlarm(Date.now() + (failed ? GENERATION_RETRY_MS : 0));
    } else await this.setNextAlarm(state, Date.now());
  }

  /**
   * Applies what time has changed: the change the alarm was set for, if it
   * was, and the Devices gone silent, if a heartbeat check was due.
   */
  private async passTime(state: MatchState): Promise<void> {
    // An alarm only runs once its time has come, so the time it was set
    // for has passed even if this clock reads a moment earlier.
    const now = Math.max(
      Date.now(),
      this.ctx.storage.kv.get<number>(ALARM_KEY) ?? 0,
    );
    const checkAt = this.ctx.storage.kv.get<number>(CHECK_KEY);
    let checked = { state, sockets: this.sockets() };
    if (checkAt !== undefined && now >= checkAt) {
      this.ctx.storage.kv.delete(CHECK_KEY);
      checked = this.dropSilent(state, now);
    }
    const { sockets } = checked;
    const next = tick(checked.state, now);
    if (next !== state) {
      this.save(next);
      this.broadcast(next, sockets, now);
    }
    await this.setNextAlarm(next, now);
  }

  /**
   * Closes the sockets of the Devices gone silent, which may pause the
   * Match from when they were last heard from. Returns the state with them
   * gone, and the sockets left.
   */
  private dropSilent(
    state: MatchState,
    now: number,
  ): { state: MatchState; sockets: WebSocket[] } {
    const sockets = this.sockets();
    const heard = new Map<WebSocket, number>();
    for (const socket of sockets) {
      const at = this.lastHeard(socket, now);
      if (at !== null) heard.set(socket, at);
    }
    const gone = silent(state, heard, now);
    if (gone.length === 0) return { state, sockets };
    for (const socket of gone) socket.close(NORMAL_CLOSURE, "Sin señal");
    const left = sockets.filter((socket) => !gone.includes(socket));
    // A Device whose other socket is still open hasn't gone; one with more
    // than one silent socket was last heard from on the latest.
    const dropped = new Map<DeviceKey, number>();
    for (const socket of gone) {
      const device = deviceOf(socket);
      const at = heard.get(socket) ?? now;
      if (device) dropped.set(device, Math.max(at, dropped.get(device) ?? at));
    }
    return {
      state: devicesChanged(state, devicesOf(left), now, dropped),
      sockets: left,
    };
  }

  /**
   * When the socket was last heard from, as of a heartbeat check at `now`:
   * when it sent the last ping the runtime answered, counted back from `now`
   * so it is in the Match's time.
   */
  private lastHeard(socket: WebSocket, now: number): number | null {
    const attachment = attachmentOf(socket);
    if (!attachment) return null;
    const clock = Date.now();
    const ping = this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime();
    const heard =
      ping !== undefined && ping >= attachment.checked
        ? now - Math.max(0, clock - ping)
        : attachment.heard;
    attach(socket, { ...attachment, heard, checked: clock });
    return heard;
  }

  /**
   * Sets the alarm for the next change time alone makes, or for the next
   * heartbeat check if that comes first. Each stored change resets it, so
   * an alarm left over from before is at worst early, and then changes
   * nothing. While Roscos are missing there is neither, so the generation's
   * alarm is left alone.
   */
  private async setNextAlarm(state: MatchState, now: number): Promise<void> {
    const times = [nextChange(state), this.nextCheck(state, now)].filter(
      (time) => time !== null,
    );
    if (times.length > 0) await this.setAlarm(Math.min(...times));
  }

  /**
   * When the next heartbeat check is due while the Match listens for
   * Devices going silent: one already set keeps its time until it has run,
   * so a stream of actions can't keep putting it off.
   */
  private nextCheck(state: MatchState, now: number): number | null {
    if (!listening(state)) {
      this.ctx.storage.kv.delete(CHECK_KEY);
      return null;
    }
    const due = this.ctx.storage.kv.get<number>(CHECK_KEY);
    if (due !== undefined) return due;
    const next = now + CHECK_MS;
    this.ctx.storage.kv.put(CHECK_KEY, next);
    return next;
  }

  private async setAlarm(at: number): Promise<void> {
    this.ctx.storage.kv.put(ALARM_KEY, at);
    await this.ctx.storage.setAlarm(at);
  }

  override async fetch(request: Request): Promise<Response> {
    const state = this.load();
    if (!state) return new Response("Partida no encontrada", { status: 404 });
    const device = parseDeviceKey(
      new URL(request.url).searchParams.get("device"),
    );
    if (!device) {
      return new Response("Falta la clave del dispositivo", { status: 400 });
    }

    const { 0: deviceEnd, 1: socket } = new WebSocketPair();
    this.ctx.acceptWebSocket(socket);
    const now = Date.now();
    attach(socket, { device, heard: now, checked: now });
    // Everyone sees this Device's Member connected, which may end a Pause,
    // and it gets its first view.
    await this.devicesChanged(state, this.sockets());
    return new Response(null, { status: 101, webSocket: deviceEnd });
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const state = this.load();
    const device = deviceOf(socket);
    if (!state || !device) return;
    const action = typeof data === "string" ? parseAction(data) : null;
    if (!action) {
      send(socket, { type: "rejected", reason: "invalid-action" });
      return;
    }
    if (action.type === "rematch") {
      await this.startRematch(socket, device);
      return;
    }

    const sockets = this.sockets();
    const result = act(state, device, action, {
      now: Date.now(),
      random: Math.random(),
      connected: devicesOf(sockets),
    });
    if (!result.ok) {
      send(socket, { type: "rejected", reason: result.reason });
      return;
    }
    this.save(result.state);
    this.broadcast(result.state, sockets);
    await this.setNextAlarm(result.state, Date.now());
  }

  /**
   * Revancha: creates the Rematch, then points every Device to it. Nothing
   * else reaches this Match meanwhile, so a second press is refused instead
   * of creating a second Rematch.
   */
  private startRematch(socket: WebSocket, device: DeviceKey): Promise<void> {
    return this.ctx.blockConcurrencyWhile(async () => {
      const state = this.load();
      if (!state) return;
      const id = this.env.MATCH.newUniqueId();
      const result = rematch(state, device, id.toString(), Date.now());
      if (!result.ok) {
        send(socket, { type: "rejected", reason: result.reason });
        return;
      }
      // Created before any Device is pointed to it, so none finds it missing.
      await this.env.MATCH.get(id).createRematch(result.rematchState);
      this.save(result.state);
      this.broadcast(result.state, this.sockets());
    });
  }

  override async webSocketClose(
    closed: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    // The runtime doesn't answer the Device's close frame for us. A reserved
    // code can't be sent back, so the answer is a normal closure.
    closed.close(
      RESERVED_CLOSE_CODES.includes(code) ? NORMAL_CLOSURE : code,
      reason,
    );
    await this.leave(closed);
  }

  override async webSocketError(failed: WebSocket): Promise<void> {
    await this.leave(failed);
  }

  /** Tells the Devices still here that this one has gone, which may pause the Match. */
  private async leave(gone: WebSocket): Promise<void> {
    const state = this.load();
    if (!state) return;
    await this.devicesChanged(
      state,
      this.sockets().filter((socket) => socket !== gone),
    );
  }

  /**
   * Records that the given sockets are now the ones following the Match,
   * and sends each its view.
   */
  private async devicesChanged(
    state: MatchState,
    sockets: WebSocket[],
  ): Promise<void> {
    const now = Date.now();
    const next = devicesChanged(state, devicesOf(sockets), now);
    this.save(next);
    this.broadcast(next, sockets, now);
    await this.setNextAlarm(next, now);
  }

  /** The sockets still open: one the Match closed may linger until it's answered. */
  private sockets(): WebSocket[] {
    return this.ctx
      .getWebSockets()
      .filter((socket) => socket.readyState === WebSocket.OPEN);
  }

  /** Sends each of the given sockets its own view of the state. */
  private broadcast(
    state: MatchState,
    sockets: WebSocket[],
    now = Date.now(),
  ): void {
    const at = { now, connected: devicesOf(sockets) };
    for (const socket of sockets) {
      const device = deviceOf(socket);
      if (device) {
        send(socket, { type: "state", state: viewFor(state, device, at) });
      }
    }
  }

  private load(): MatchState | undefined {
    // Only this class writes this key, always with a MatchState.
    return this.ctx.storage.kv.get<MatchState>(STATE_KEY);
  }

  private save(state: MatchState): void {
    this.ctx.storage.kv.put(STATE_KEY, state);
  }
}

function attachmentOf(socket: WebSocket): Attachment | null {
  const attachment: unknown = socket.deserializeAttachment();
  const result = attachmentSchema.safeParse(attachment);
  return result.success ? result.data : null;
}

function attach(socket: WebSocket, attachment: Attachment): void {
  socket.serializeAttachment(attachment);
}

function deviceOf(socket: WebSocket): DeviceKey | null {
  return attachmentOf(socket)?.device ?? null;
}

function devicesOf(sockets: WebSocket[]): Set<DeviceKey> {
  const devices = new Set<DeviceKey>();
  for (const socket of sockets) {
    const device = deviceOf(socket);
    if (device) devices.add(device);
  }
  return devices;
}

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}
