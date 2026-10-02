import { DurableObject } from "cloudflare:workers";
import type { MatchState, StateMessage } from "../shared/protocol";

// WebSocket close codes (RFC 6455, section 7.4.1).
const NORMAL_CLOSURE = 1000;
const NO_STATUS_RECEIVED = 1005;

/**
 * One Match: owns its state and the WebSockets of the Devices following it
 * (ADR 0002). Uses the WebSocket Hibernation API, so the connected Devices
 * are the sockets the runtime holds for this object.
 */
export class Match extends DurableObject<Env> {
  override fetch(): Response {
    const { 0: device, 1: socket } = new WebSocketPair();
    this.ctx.acceptWebSocket(socket);
    this.broadcast(this.ctx.getWebSockets());
    return new Response(null, { status: 101, webSocket: device });
  }

  override webSocketClose(
    closed: WebSocket,
    code: number,
    reason: string,
  ): void {
    this.broadcastWithout(closed);
    // The runtime doesn't answer the Device's close frame for us. 1005 means
    // the Device sent no code, and it can't be sent back.
    closed.close(code === NO_STATUS_RECEIVED ? NORMAL_CLOSURE : code, reason);
  }

  override webSocketError(failed: WebSocket): void {
    this.broadcastWithout(failed);
  }

  private broadcastWithout(gone: WebSocket): void {
    this.broadcast(
      this.ctx.getWebSockets().filter((socket) => socket !== gone),
    );
  }

  private broadcast(sockets: WebSocket[]): void {
    const state: MatchState = { devices: sockets.length };
    const message: StateMessage = { type: "state", state };
    const data = JSON.stringify(message);
    for (const socket of sockets) {
      socket.send(data);
    }
  }
}
