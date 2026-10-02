import { describe, expect, it } from "vitest";
import {
  parseServerMessage,
  type Action,
  type DeviceKey,
  type MatchView,
  type ServerMessage,
  type Settings,
} from "../../src/shared/protocol";
import {
  createMatch,
  neverIssuedMatchId,
  newDeviceKey,
  request,
  UNHOSTED,
} from "./helpers";

const HOSTED: Settings = { ...UNHOSTED, hosted: true };

interface Device {
  /** The next message this Device receives, in order. */
  nextMessage(): Promise<ServerMessage>;
  /** The next message, which must be a state. */
  nextState(): Promise<MatchView>;
  send(action: Action | string): void;
  /** Closes the socket; resolves with the code of the Match's close reply. */
  disconnect(code?: number): Promise<number>;
}

function openSocket(
  matchId: string,
  device: string | null,
  headers: HeadersInit = { Upgrade: "websocket" },
): Promise<Response> {
  const query = device === null ? "" : `?device=${device}`;
  return request(`/api/matches/${matchId}/ws${query}`, { headers });
}

async function connectDevice(
  matchId: string,
  key: DeviceKey = newDeviceKey(),
): Promise<Device> {
  const response = await openSocket(matchId, key);
  const socket = response.webSocket;
  if (!socket) throw new Error(`No WebSocket, status ${response.status}`);
  socket.accept();

  const received: ServerMessage[] = [];
  const waiting: ((message: ServerMessage) => void)[] = [];
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseServerMessage(event.data);
    if (!message) throw new Error(`Unexpected message: ${event.data}`);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else received.push(message);
  });

  const device: Device = {
    nextMessage() {
      const message = received.shift();
      if (message) return Promise.resolve(message);
      return new Promise((resolve) => waiting.push(resolve));
    },
    async nextState() {
      const message = await device.nextMessage();
      if (message.type !== "state") {
        throw new Error(`Expected a state, got ${JSON.stringify(message)}`);
      }
      return message.state;
    },
    send(action) {
      socket.send(typeof action === "string" ? action : JSON.stringify(action));
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
  return device;
}

/** Connects a new Device and joins it under the given name; returns its Member id. */
async function join(
  matchId: string,
  name: string,
): Promise<{ device: Device; id: number }> {
  const device = await connectDevice(matchId);
  await device.nextState();
  device.send({ type: "join", name });
  const { you } = await device.nextState();
  if (you === null) throw new Error("Join failed");
  return { device, id: you };
}

/** Skips states until one matches; Devices also get a state whenever another one connects or leaves. */
async function nextStateWhere(
  device: Device,
  matches: (view: MatchView) => boolean,
): Promise<MatchView> {
  let view = await device.nextState();
  while (!matches(view)) view = await device.nextState();
  return view;
}

describe("a Device following a Match", () => {
  it("receives the Lobby as soon as it connects", async () => {
    const { id } = await createMatch(UNHOSTED, "Ana");

    const device = await connectDevice(id);

    expect(await device.nextState()).toMatchObject({
      phase: "lobby",
      settings: UNHOSTED,
      members: [{ name: "Ana" }],
      you: null,
    });
  });

  it("is the Creator when it is the Device that created the Match", async () => {
    const { id, creator } = await createMatch();

    const device = await connectDevice(id, creator);

    const view = await device.nextState();
    expect(view.you).toBe(view.creator);
  });

  it("sees another Device join", async () => {
    const { id, creator } = await createMatch();
    const ana = await connectDevice(id, creator);
    await ana.nextState();

    await join(id, "Bea");

    const view = await nextStateWhere(ana, (each) => each.members.length > 1);
    expect(view.members.map((member) => member.name)).toEqual(["Ana", "Bea"]);
  });

  it("keeps its identity when it reconnects with the same key", async () => {
    const { id } = await createMatch();
    const key = newDeviceKey();
    const first = await connectDevice(id, key);
    await first.nextState();
    first.send({ type: "join", name: "Bea" });
    const { you } = await first.nextState();
    await first.disconnect(1000);

    const again = await connectDevice(id, key);

    expect((await again.nextState()).you).toBe(you);
  });

  it("sees a Member marked disconnected when their Device closes the Match", async () => {
    const { id, creator } = await createMatch();
    const ana = await connectDevice(id, creator);
    await ana.nextState();
    const bea = await join(id, "Bea");
    await nextStateWhere(ana, (view) => view.members.length === 2);

    await bea.device.disconnect(1000);

    const view = await nextStateWhere(ana, (each) =>
      each.members.some((member) => !member.connected),
    );
    expect(view.members).toEqual([
      { id: view.creator, name: "Ana", connected: true },
      { id: bea.id, name: "Bea", connected: false },
    ]);
  });

  it("sees a Member connected again when their Device comes back", async () => {
    const { id, creator } = await createMatch();
    const ana = await connectDevice(id, creator);
    await ana.nextState();
    const key = newDeviceKey();
    const bea = await connectDevice(id, key);
    await bea.nextState();
    bea.send({ type: "join", name: "Bea" });
    await bea.nextState();
    await bea.disconnect(1000);
    await nextStateWhere(ana, (view) =>
      view.members.some((member) => !member.connected),
    );

    await connectDevice(id, key);

    const view = await nextStateWhere(ana, (each) =>
      each.members.every((member) => member.connected),
    );
    expect(view.members.map((member) => member.name)).toEqual(["Ana", "Bea"]);
  });

  it("is told why the Match refused its action", async () => {
    const { id } = await createMatch();
    const device = await connectDevice(id);
    await device.nextState();

    device.send({ type: "join", name: "ana" });

    expect(await device.nextMessage()).toEqual({
      type: "rejected",
      reason: "name-taken",
    });
  });

  it("is told when it sends something that isn't an action", async () => {
    const { id } = await createMatch();
    const device = await connectDevice(id);
    await device.nextState();

    device.send('{"type":"cheat"}');

    expect(await device.nextMessage()).toEqual({
      type: "rejected",
      reason: "invalid-action",
    });
  });

  it("gets its close answered", async () => {
    const { id } = await createMatch();
    const device = await connectDevice(id);

    expect(await device.disconnect(1000)).toBe(1000);
  });

  it("gets its close answered when it sends no close code", async () => {
    const { id } = await createMatch();
    const device = await connectDevice(id);

    expect(await device.disconnect()).toBe(1000);
  });

  it("only sees Members of its own Match", async () => {
    const other = await createMatch(UNHOSTED, "Otra");
    await join(other.id, "Bea");
    const { id } = await createMatch(UNHOSTED, "Ana");

    const device = await connectDevice(id);

    const view = await device.nextState();
    expect(view.members.map((member) => member.name)).toEqual(["Ana"]);
  });
});

describe("Empezar", () => {
  it("is refused while a role is missing", async () => {
    const { id, creator } = await createMatch(HOSTED);
    const ana = await connectDevice(id, creator);
    const { you: anaId } = await ana.nextState();
    const bea = await join(id, "Bea");
    ana.send({ type: "assign", role: "player1", member: anaId });
    ana.send({ type: "assign", role: "player2", member: bea.id });
    await nextStateWhere(ana, (view) => view.roles.player2 === bea.id);

    ana.send({ type: "start" });

    expect(await ana.nextMessage()).toEqual({
      type: "rejected",
      reason: "roles-missing",
    });
  });

  it("starts a Match that isn't Hosted with no Host in it", async () => {
    const { id, creator } = await createMatch(UNHOSTED);
    const ana = await connectDevice(id, creator);
    const { you: anaId } = await ana.nextState();
    const bea = await join(id, "Bea");
    const carlos = await join(id, "Carlos");

    ana.send({ type: "assign", role: "host", member: carlos.id });
    ana.send({ type: "assign", role: "player1", member: anaId });
    ana.send({ type: "assign", role: "player2", member: bea.id });
    ana.send({ type: "start" });

    const messages: ServerMessage[] = [];
    let message = await ana.nextMessage();
    while (message.type !== "state" || message.state.phase !== "started") {
      messages.push(message);
      message = await ana.nextMessage();
    }
    expect(messages).toContainEqual({ type: "rejected", reason: "not-hosted" });
    expect(message.state.roles).toEqual({
      host: null,
      player1: anaId,
      player2: bea.id,
    });
  });

  it("tells every Device the roles and who plays first", async () => {
    const { id, creator } = await createMatch(HOSTED);
    const ana = await connectDevice(id, creator);
    const { you: anaId } = await ana.nextState();
    const bea = await join(id, "Bea");
    const carlos = await join(id, "Carlos");
    const watcher = await connectDevice(id);
    await watcher.nextState();
    const roles = { host: carlos.id, player1: bea.id, player2: anaId };
    for (const role of ["host", "player1", "player2"] as const) {
      ana.send({ type: "assign", role, member: roles[role] });
    }

    ana.send({ type: "start" });

    for (const device of [ana, bea.device, carlos.device, watcher]) {
      let view = await device.nextState();
      while (view.phase === "lobby") view = await device.nextState();
      expect(view).toMatchObject({
        phase: "started",
        roles,
        firstPlayer: expect.stringMatching(/^player[12]$/),
        countdownMs: expect.any(Number),
      });
    }
  });
});

describe("GET /api/matches/<id>/ws", () => {
  it("requires a WebSocket upgrade", async () => {
    const { id } = await createMatch();

    const response = await openSocket(id, newDeviceKey(), {});

    expect(response.status).toBe(426);
  });

  it("requires a device key", async () => {
    const { id } = await createMatch();

    const response = await openSocket(id, null);

    expect(response.status).toBe(400);
  });

  it("returns 404 for a malformed id", async () => {
    const response = await openSocket("not-a-match-id", newDeviceKey());

    expect(response.status).toBe(404);
  });

  it("returns 404 for an id that was never issued", async () => {
    const response = await openSocket(
      await neverIssuedMatchId(),
      newDeviceKey(),
    );

    expect(response.status).toBe(404);
  });
});
