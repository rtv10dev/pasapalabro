import { DurableObject } from "cloudflare:workers";
import { generateRosco } from "../clues/generate";
import {
  act,
  addRosco,
  missingRoscos,
  newMatch,
  nextChange,
  rematch,
  tick,
  viewFor,
  type MatchState,
} from "../rules/match";
import {
  parseAction,
  parseDeviceKey,
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
    if (missingRoscos(state) > 0) await this.ctx.storage.setAlarm(Date.now());
  }

  /**
   * Generates the Roscos the Stock couldn't give while any are missing;
   * once they are all here, applies the change time has brought: the end of
   * a countdown or Handover, or a Clock reaching zero.
   */
  override async alarm(): Promise<void> {
    const state = this.load();
    if (!state) return;
    if (missingRoscos(state) > 0) await this.generateRoscos(state);
    else await this.passTime(state);
  }

  /**
   * Generates the missing Roscos, both at once so the Players wait for one
   * generation, not two. Keeps any that succeed, and tries again a minute
   * later while some are missing: the first Turn can't begin without them.
   */
  private async generateRoscos(before: MatchState): Promise<void> {
    const results = await Promise.allSettled(
      Array.from({ length: missingRoscos(before) }, () =>
        generateRosco(before.settings.difficulty, generation(this.env)),
      ),
    );
    // Members may have joined while the Roscos were being generated.
    let state = this.load() ?? before;
    for (const result of results) {
      if (result.status === "fulfilled") {
        state = addRosco(state, result.value, Date.now());
      } else console.error("Couldn't generate a Rosco", result.reason);
    }
    this.save(state);
    this.broadcast(state, this.ctx.getWebSockets());
    if (missingRoscos(state) > 0) {
      await this.ctx.storage.setAlarm(Date.now() + GENERATION_RETRY_MS);
    } else await this.wakeForNextChange(state);
  }

  private async passTime(state: MatchState): Promise<void> {
    // An alarm only runs once its time has come, so the change it was set
    // for is due even if this clock reads a moment earlier.
    const now = Math.max(Date.now(), nextChange(state) ?? 0);
    const next = tick(state, now);
    this.save(next);
    this.broadcast(next, this.ctx.getWebSockets(), now);
    await this.wakeForNextChange(next);
  }

  /**
   * Sets the alarm for the next change time alone makes, if any. Each stored
   * change resets it, so an alarm left over from before is at worst early,
   * and then changes nothing. While Roscos are missing there is no such
   * change, so the generation's alarm is left alone.
   */
  private async wakeForNextChange(state: MatchState): Promise<void> {
    const at = nextChange(state);
    if (at !== null) await this.ctx.storage.setAlarm(at);
  }

  override fetch(request: Request): Response {
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
    socket.serializeAttachment(device);
    // Everyone sees this Device's Member connected, and it gets its first view.
    this.broadcast(state, this.ctx.getWebSockets());
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

    const sockets = this.ctx.getWebSockets();
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
    await this.wakeForNextChange(result.state);
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
      this.broadcast(result.state, this.ctx.getWebSockets());
    });
  }

  override webSocketClose(
    closed: WebSocket,
    code: number,
    reason: string,
  ): void {
    this.leave(closed);
    // The runtime doesn't answer the Device's close frame for us. A reserved
    // code can't be sent back, so the answer is a normal closure.
    closed.close(
      RESERVED_CLOSE_CODES.includes(code) ? NORMAL_CLOSURE : code,
      reason,
    );
  }

  override webSocketError(failed: WebSocket): void {
    this.leave(failed);
  }

  /** Tells the Devices still here that this one has gone. */
  private leave(gone: WebSocket): void {
    const state = this.load();
    if (!state) return;
    this.broadcast(
      state,
      this.ctx.getWebSockets().filter((socket) => socket !== gone),
    );
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

function deviceOf(socket: WebSocket): DeviceKey | null {
  const attachment: unknown = socket.deserializeAttachment();
  return parseDeviceKey(attachment);
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
