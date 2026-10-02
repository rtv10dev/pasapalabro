import { DurableObject } from "cloudflare:workers";
import { generateRosco } from "../clues/generate";
import {
  act,
  addRosco,
  missingRoscos,
  newMatch,
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
const NO_STATUS_RECEIVED = 1005;

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
    let state = result.state;
    const roscos = await stockOf(this.env).take(
      settings.difficulty,
      missingRoscos(state),
    );
    for (const rosco of roscos) state = addRosco(state, rosco, Date.now());
    this.save(state);
    if (missingRoscos(state) > 0) await this.ctx.storage.setAlarm(Date.now());
    return null;
  }

  /**
   * Generates the Roscos the Stock couldn't give, both at once so the
   * Players wait for one generation, not two. Keeps any that succeed, and
   * tries again a minute later while some are missing: the first Turn can't
   * begin without them.
   */
  override async alarm(): Promise<void> {
    const before = this.load();
    if (!before) return;
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
    }
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

  override webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): void {
    const state = this.load();
    const device = deviceOf(socket);
    if (!state || !device) return;
    const action = typeof data === "string" ? parseAction(data) : null;
    if (!action) {
      send(socket, { type: "rejected", reason: "invalid-action" });
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
  }

  override webSocketClose(
    closed: WebSocket,
    code: number,
    reason: string,
  ): void {
    this.leave(closed);
    // The runtime doesn't answer the Device's close frame for us. 1005 means
    // the Device sent no code, and it can't be sent back.
    closed.close(code === NO_STATUS_RECEIVED ? NORMAL_CLOSURE : code, reason);
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
  private broadcast(state: MatchState, sockets: WebSocket[]): void {
    const at = { now: Date.now(), connected: devicesOf(sockets) };
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
