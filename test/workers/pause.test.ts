import { describe, expect, it } from "vitest";
import type { MemberId, PlayerRole, Settings } from "../../src/shared/protocol";
import {
  connectDevice,
  fireAlarm,
  firstTurn,
  nextPlaying,
  UNHOSTED,
  type Device,
} from "./helpers";

function otherPlayer(role: PlayerRole): PlayerRole {
  return role === "player1" ? "player2" : "player1";
}

/**
 * `firstTurn()` with its first Turn begun and running: the Devices of the
 * playing Player, of the Host of the Turn and of the waiting Player.
 */
async function running(settings: Settings = UNHOSTED): Promise<{
  id: string;
  player: Device;
  host: Device;
  waiting: Device;
  /** The playing Player's Member id. */
  playerId: MemberId;
}> {
  const { id, players, host, first } = await firstTurn(settings);
  const waiting = players[otherPlayer(first)];
  const turnHost = host ?? waiting;
  await nextPlaying(turnHost);
  turnHost.send({ type: "begin-turn" });
  const view = await nextPlaying(turnHost, (each) => each.stage === "running");
  const playerId = view.roles[first];
  if (playerId === null) throw new Error("No playing Player");
  return { id, player: players[first], host: turnHost, waiting, playerId };
}

describe("a Device dropping", () => {
  it("pauses the Match when the Turn needs it, showing every other Device who is missing", async () => {
    const { player, host, playerId } = await running();

    await player.disconnect();

    const view = await nextPlaying(host);
    expect(view.stage).toBe("running");
    expect(view.pause).toMatchObject({ missing: [playerId] });
  });

  it("doesn't pause the Match when the Turn doesn't need it", async () => {
    const { host, waiting } = await running({ ...UNHOSTED, hosted: true });

    await waiting.disconnect();

    const view = await nextPlaying(host);
    expect(view.members.some((member) => !member.connected)).toBe(true);
    expect(view).toMatchObject({ stage: "running", pause: null });
  });
});

describe("a Device coming back", () => {
  it("through the same link gets its role back and the Match goes on", async () => {
    const { id, player, host, playerId } = await running();
    await player.disconnect();
    const paused = await nextPlaying(host, (view) => view.pause !== null);
    const { turn } = paused;

    const back = await connectDevice(id, player.key);

    expect(await nextPlaying(back)).toMatchObject({
      you: playerId,
      stage: "running",
      pause: null,
    });
    const resumed = await nextPlaying(host);
    expect(resumed).toMatchObject({ stage: "running", pause: null });
    // The Clock stood still while paused, and goes on from there.
    expect(resumed.roscos[turn].clockMs).toBe(paused.roscos[turn].clockMs);
  });
});

describe("a Pause", () => {
  it("abandons the Match on every Device when its alarm runs, 60 s on", async () => {
    const { id, player, host } = await running();
    await player.disconnect();
    await nextPlaying(host, (view) => view.pause !== null);

    expect(await fireAlarm(id)).toBe(true);

    expect(await nextPlaying(host)).toMatchObject({
      stage: "abandoned",
      pause: null,
    });
    const back = await connectDevice(id, player.key);
    expect((await nextPlaying(back)).stage).toBe("abandoned");
  });
});
