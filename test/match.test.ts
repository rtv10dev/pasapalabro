import { describe, expect, it } from "vitest";
import { parseStateMessage, type MatchState } from "../src/shared/protocol";
import { createMatch, neverIssuedMatchId, request } from "./helpers";

interface Device {
  /** The next state this Device receives, in order. */
  nextState(): Promise<MatchState>;
  /** Closes the socket; resolves with the code of the Match's close reply. */
  disconnect(code?: number): Promise<number>;
}

function openSocket(matchId: string, headers: HeadersInit): Promise<Response> {
  return request(`/api/matches/${matchId}/ws`, { headers });
}

async function connectDevice(matchId: string): Promise<Device> {
  const response = await openSocket(matchId, { Upgrade: "websocket" });
  const socket = response.webSocket;
  if (!socket) throw new Error(`No WebSocket, status ${response.status}`);
  socket.accept();

  const received: MatchState[] = [];
  const waiting: ((state: MatchState) => void)[] = [];
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseStateMessage(event.data);
    if (!message) throw new Error(`Unexpected message: ${event.data}`);
    const waiter = waiting.shift();
    if (waiter) waiter(message.state);
    else received.push(message.state);
  });

  return {
    nextState() {
      const state = received.shift();
      if (state) return Promise.resolve(state);
      return new Promise((resolve) => waiting.push(resolve));
    },
    disconnect(code) {
      const replied = new Promise<number>((resolve) => {
        socket.addEventListener("close", (event) => {
          resolve(event.code);
        });
      });
      socket.close(code);
      return replied;
    },
  };
}

describe("a Device following a Match", () => {
  it("receives the Match's state as soon as it connects", async () => {
    const matchId = await createMatch();

    const device = await connectDevice(matchId);

    expect(await device.nextState()).toEqual({ devices: 1 });
  });

  it("receives the new state when another device connects", async () => {
    const matchId = await createMatch();
    const first = await connectDevice(matchId);
    await first.nextState();

    const second = await connectDevice(matchId);

    expect(await first.nextState()).toEqual({ devices: 2 });
    expect(await second.nextState()).toEqual({ devices: 2 });
  });

  it("receives the new state when another device disconnects", async () => {
    const matchId = await createMatch();
    const staying = await connectDevice(matchId);
    const leaving = await connectDevice(matchId);
    await staying.nextState();
    await staying.nextState();

    void leaving.disconnect(1000);

    expect(await staying.nextState()).toEqual({ devices: 1 });
  });

  it("gets its close answered", async () => {
    const device = await connectDevice(await createMatch());

    expect(await device.disconnect(1000)).toBe(1000);
  });

  it("gets its close answered when it sends no close code", async () => {
    const device = await connectDevice(await createMatch());

    expect(await device.disconnect()).toBe(1000);
  });

  it("only sees devices of its own Match", async () => {
    const otherMatchId = await createMatch();
    await connectDevice(otherMatchId);
    const matchId = await createMatch();

    const device = await connectDevice(matchId);

    expect(await device.nextState()).toEqual({ devices: 1 });
  });
});

describe("GET /api/matches/<id>/ws", () => {
  it("requires a WebSocket upgrade", async () => {
    const matchId = await createMatch();

    const response = await openSocket(matchId, {});

    expect(response.status).toBe(426);
  });

  it("returns 404 for a malformed id", async () => {
    const response = await openSocket("not-a-match-id", {
      Upgrade: "websocket",
    });

    expect(response.status).toBe(404);
  });

  it("returns 404 for an id that was never issued", async () => {
    const response = await openSocket(await neverIssuedMatchId(), {
      Upgrade: "websocket",
    });

    expect(response.status).toBe(404);
  });
});
