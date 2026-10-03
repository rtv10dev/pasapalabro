import { describe, expect, it } from "vitest";
import type { MatchView, PlayerRole } from "../../src/shared/protocol";
import {
  fireAlarm,
  firstTurn as firstTurnOf,
  isPlaying,
  nextPlaying,
  ROSCOS,
  UNHOSTED,
  type Device,
} from "./helpers";

/** `firstTurn()`, with the Devices by role in the first Turn. */
async function firstTurn(): Promise<{
  id: string;
  player: Device;
  host: Device;
  first: PlayerRole;
}> {
  const { id, players, first } = await firstTurnOf();
  const second = first === "player1" ? "player2" : "player1";
  return { id, player: players[first], host: players[second], first };
}

describe("the Turns of a Match", () => {
  it("begin on every Device when the countdown's alarm runs", async () => {
    const { player, host, first } = await firstTurn();

    for (const device of [player, host]) {
      expect(await nextPlaying(device)).toMatchObject({
        turn: first,
        stage: "waiting",
      });
    }
  });

  it("are played by the Host's buttons and handed over by alarm", async () => {
    const { id, player, host, first } = await firstTurn();
    await nextPlaying(host);

    host.send({ type: "begin-turn" });
    host.send({ type: "judge", verdict: "hit" });
    host.send({ type: "judge", verdict: "miss" });

    const handover = await nextPlaying(
      player,
      (view) => view.stage === "handover",
    );
    expect(handover.revealed).toEqual({
      letter: "B",
      answer: ROSCOS[first][1]?.answer,
    });
    expect(handover.roscos[first].letters.slice(0, 3)).toEqual([
      { letter: "A", result: "hit" },
      { letter: "B", result: "miss" },
      { letter: "C", result: "pending" },
    ]);

    expect(await fireAlarm(id)).toBe(true);

    // The Player who just played is Host of the next Turn.
    const next = await nextPlaying(player, (view) => view.stage === "waiting");
    expect(next.turn).not.toBe(first);
    expect(next.turnHost).toBe(next.you);
    expect(next.clue).toMatchObject({
      letter: "A",
      answer: ROSCOS[next.turn][0]?.answer,
    });
  });

  it("end when the running Clock's alarm runs", async () => {
    const { id, host, first } = await firstTurn();
    await nextPlaying(host);
    host.send({ type: "begin-turn" });
    await nextPlaying(host, (view) => view.stage === "running");

    expect(await fireAlarm(id)).toBe(true);

    const view = await nextPlaying(host, (each) => each.stage === "handover");
    expect(view.roscos[first]).toMatchObject({ clockMs: 0, finished: true });
  });

  it("stay with the Player left after a Fallo, handed back by alarm once the other has finished", async () => {
    const { id, player, host, first } = await firstTurn();
    await nextPlaying(host);
    host.send({ type: "begin-turn" });
    await nextPlaying(host, (view) => view.stage === "running");
    // The first Player's Clock runs out, then the Handover ends.
    expect(await fireAlarm(id)).toBe(true);
    expect(await fireAlarm(id)).toBe(true);
    await nextPlaying(player, (view) => view.stage === "waiting");

    // The first Player, now finished, hosts the one left.
    player.send({ type: "begin-turn" });
    player.send({ type: "judge", verdict: "miss" });
    const handover = await nextPlaying(
      host,
      (view) => view.stage === "handover" && view.revealed !== null,
    );
    const left = handover.turn;
    expect(left).not.toBe(first);
    expect(handover.revealed).toEqual({
      letter: "A",
      answer: ROSCOS[left][0]?.answer,
    });

    expect(await fireAlarm(id)).toBe(true);

    const next = await nextPlaying(player, (view) => view.stage === "waiting");
    expect(next.turn).toBe(left);
    expect(next.turnHost).toBe(next.you);
    expect(next.roscos[left].finished).toBe(false);
  });

  it("never send the playing Player the Clue or its answer before it is revealed", async () => {
    const { player, host } = await firstTurn();
    const received: MatchView[] = [];
    await nextPlaying(host);
    host.send({ type: "begin-turn" });
    host.send({ type: "judge", verdict: "hit" });
    host.send({ type: "judge", verdict: "pasapalabra" });
    let view = await player.nextState();
    received.push(view);
    while (!(isPlaying(view) && view.stage === "handover")) {
      view = await player.nextState();
      received.push(view);
    }

    const sent = JSON.stringify(received);
    expect(sent).not.toContain("Definición");
    for (const answer of ["abeja", "ballena", "caracol"]) {
      expect(sent).not.toContain(answer);
    }
  });

  it("show the Tally on every Device until its alarm runs, in a Hosted Match", async () => {
    const { id, players, host } = await firstTurnOf({
      ...UNHOSTED,
      hosted: true,
    });
    if (!host) throw new Error("No Host");
    const devices = [players.player1, players.player2, host];
    for (const device of devices) await nextPlaying(device);

    host.send({ type: "show-tally" });
    for (const device of devices) {
      const view = await nextPlaying(device);
      expect(view.tallyMs).toBeGreaterThan(0);
    }

    expect(await fireAlarm(id)).toBe(true);

    for (const device of devices) {
      const view = await nextPlaying(device);
      expect(view).toMatchObject({ stage: "waiting", tallyMs: null });
    }
  });
});
