import { describe, expect, it } from "vitest";
import type {
  MatchView,
  PlayerRole,
  PlayingView,
} from "../../src/shared/protocol";
import {
  connectDevice,
  createMatch,
  fireAlarm,
  join,
  nextStateWhere,
  type Device,
} from "./helpers";

function isPlaying(view: MatchView): view is PlayingView {
  return view.phase === "playing";
}

/** Waits for a playing state that matches. */
async function nextPlaying(
  device: Device,
  matches: (view: PlayingView) => boolean = () => true,
): Promise<PlayingView> {
  const view = await nextStateWhere(
    device,
    (each) => isPlaying(each) && matches(each),
  );
  if (!isPlaying(view)) throw new Error("Not playing");
  return view;
}

/**
 * A non-Hosted Match with Ana and Bea as Players, past its countdown: both
 * pressed ¡Listo! and the countdown's alarm has run. Returns their Devices by
 * role in the first Turn.
 */
async function firstTurn(): Promise<{
  id: string;
  player: Device;
  host: Device;
  first: PlayerRole;
}> {
  const { id, creator } = await createMatch();
  const ana = await connectDevice(id, creator);
  const { you: anaId } = await ana.nextState();
  const bea = await join(id, "Bea");
  ana.send({ type: "assign", role: "player1", member: anaId });
  ana.send({ type: "assign", role: "player2", member: bea.id });
  ana.send({ type: "start" });
  const started = await nextStateWhere(ana, (view) => view.phase === "started");
  if (started.phase !== "started") throw new Error("Not started");
  ana.send({ type: "ready" });
  bea.device.send({ type: "ready" });
  await nextStateWhere(
    ana,
    (view) => view.phase === "started" && view.countdownMs !== null,
  );

  expect(await fireAlarm(id)).toBe(true);

  const first = started.firstPlayer;
  const [player, host] =
    first === "player1" ? [ana, bea.device] : [bea.device, ana];
  return { id, player, host, first };
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
    expect(handover.revealed).toEqual({ letter: "B", answer: "ballena" });
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
    expect(next.clue).toMatchObject({ letter: "A", answer: "abeja" });
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
});
