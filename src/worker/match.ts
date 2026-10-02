import { DurableObject } from "cloudflare:workers";
import { act, newMatch, viewFor, type MatchState } from "../rules/match";
import {
  parseAction,
  parseDeviceKey,
  type Creator,
  type DeviceKey,
  type Rejection,
  type ServerMessage,
  type Settings,
} from "../shared/protocol";

// WebSocket close codes (RFC 6455, section 7.4.1).
const NORMAL_CLOSURE = 1000;
const NO_STATUS_RECEIVED = 1005;

const STATE_KEY = "state";

/**
 * One Match: owns its state and the WebSockets of the Devices following it
 * (ADR 0002). Uses the WebSocket Hibernation API, so the connected Devices
 * are the sockets the runtime holds for this object, each tagged with its
 * DeviceKey. The rules live in `../rules`; this class only loads and
 * stores state, validates messages and broadcasts.
 */
export class Match extends DurableObject<Env> {
  /** Sets the Match up; the Worker calls it once, right after issuing the id. */
  create(settings: Settings, creator: Creator): Rejection | null {
    const result = newMatch(settings, creator);
    if (!result.ok) return result.reason;
    this.save(result.state);
    return null;
  }

  override fetch(request: Request): Response {
    const state = this.load();
    if (!state) return new Response("Partida no encontrada", { status: 404 });
    const device = parseDeviceKey(
      new URL(request.url).searchParams.get("device"),
    );
    if (!device)
      return new Response("Falta la clave del dispositivo", { status: 400 });

    const { 0: deviceEnd, 1: socket } = new WebSocketPair();
    this.ctx.acceptWebSocket(socket);
    socket.serializeAttachment(device);
    send(socket, { type: "state", state: viewFor(state, device, Date.now()) });
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

    const now = Date.now();
    const result = act(state, device, action, { now, random: Math.random() });
    if (!result.ok) {
      send(socket, { type: "rejected", reason: result.reason });
      return;
    }
    this.save(result.state);
    for (const follower of this.ctx.getWebSockets()) {
      const key = deviceOf(follower);
      if (key)
        send(follower, {
          type: "state",
          state: viewFor(result.state, key, now),
        });
    }
  }

  override webSocketClose(
    closed: WebSocket,
    code: number,
    reason: string,
  ): void {
    // The runtime doesn't answer the Device's close frame for us. 1005 means
    // the Device sent no code, and it can't be sent back.
    closed.close(code === NO_STATUS_RECEIVED ? NORMAL_CLOSURE : code, reason);
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

function send(socket: WebSocket, message: ServerMessage): void {
  socket.send(JSON.stringify(message));
}
