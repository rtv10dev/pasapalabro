import { describe, expect, it } from "vitest";
import type { ServerMessage, Settings } from "../../src/shared/protocol";
import {
  connectDevice,
  createMatch,
  join,
  neverIssuedMatchId,
  newDeviceKey,
  nextStateWhere,
  openSocket,
  UNHOSTED,
} from "./helpers";

const HOSTED: Settings = { ...UNHOSTED, hosted: true };

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
        ready: { player1: false, player2: false },
        countdownMs: null,
      });
    }
  });

  it("counts down on every Device once both Players press ¡Listo!", async () => {
    const { id, creator } = await createMatch(HOSTED);
    const ana = await connectDevice(id, creator);
    const { you: anaId } = await ana.nextState();
    const bea = await join(id, "Bea");
    const carlos = await join(id, "Carlos");
    const roles = { host: carlos.id, player1: bea.id, player2: anaId };
    for (const role of ["host", "player1", "player2"] as const) {
      ana.send({ type: "assign", role, member: roles[role] });
    }
    ana.send({ type: "start" });
    await nextStateWhere(bea.device, (view) => view.phase === "started");

    ana.send({ type: "ready" });
    bea.device.send({ type: "ready" });

    for (const device of [ana, bea.device, carlos.device]) {
      const view = await nextStateWhere(
        device,
        (each) => each.phase === "started" && each.countdownMs !== null,
      );
      expect(view).toMatchObject({
        ready: { player1: true, player2: true },
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
