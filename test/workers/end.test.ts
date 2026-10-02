import { describe, expect, it } from "vitest";
import type {
  PlayerRole,
  PlayingView,
  Verdict,
} from "../../src/shared/protocol";
import {
  connectDevice,
  fireAlarm,
  firstTurn,
  nextPlaying,
  nextStateWhere,
  stockUp,
  type Device,
} from "./helpers";

function otherPlayer(role: PlayerRole): PlayerRole {
  return role === "player1" ? "player2" : "player1";
}

/**
 * Plays a Turn of the given Player: their Host presses Empezar turno and
 * gives the verdicts; then alarms run the Clock out, if it is still running,
 * and the Handover. Returns the Host's view once the Turn is over.
 */
async function playTurn(
  id: string,
  players: Record<PlayerRole, Device>,
  turn: PlayerRole,
  verdicts: Verdict[],
): Promise<PlayingView> {
  const host = players[otherPlayer(turn)];
  await nextPlaying(
    host,
    (view) => view.stage === "waiting" && view.turn === turn,
  );
  // Every accepted action sends each Device one state.
  host.send({ type: "begin-turn" });
  let view = await nextPlaying(host);
  for (const verdict of verdicts) {
    host.send({ type: "judge", verdict });
    view = await nextPlaying(host);
  }
  while (view.stage === "running" || view.stage === "handover") {
    expect(await fireAlarm(id)).toBe(true);
    view = await nextPlaying(host);
  }
  return view;
}

/**
 * Plays a non-Hosted Match to its end: one list of verdicts per Turn, the
 * Players taking turns from the one chance picked. Returns the last view of
 * each Player's Device.
 */
async function playedOut(turns: Verdict[][]): Promise<{
  id: string;
  players: Record<PlayerRole, Device>;
  first: PlayerRole;
  views: Record<PlayerRole, PlayingView>;
}> {
  const { id, players, first } = await firstTurn();
  let turn = first;
  let last: PlayingView | null = null;
  for (const verdicts of turns) {
    last = await playTurn(id, players, turn, verdicts);
    turn = otherPlayer(turn);
  }
  if (last?.stage !== "over") throw new Error("The Match isn't over");
  // `turn` has moved on to the last Turn's Host, whose view of the end is
  // `last`; the Player who played it waits for theirs.
  const played = await nextPlaying(
    players[otherPlayer(turn)],
    (view) => view.stage === "over",
  );
  return {
    id,
    players,
    first,
    views:
      turn === "player1"
        ? { player1: last, player2: played }
        : { player1: played, player2: last },
  };
}

describe("the end of a Match", () => {
  it("shows every Device the winner: the Player with most Hits", async () => {
    const { first, views } = await playedOut([
      ["hit", "hit", "miss"],
      ["hit", "miss"],
      [],
      [],
    ]);

    for (const view of Object.values(views)) {
      expect(view.results?.winner).toBe(first);
    }
  });

  it("breaks a tie on Hits by fewest Misses", async () => {
    // The second Player runs out of time with a Hit and no Miss; the first
    // then does too, with a Miss.
    const { first, views } = await playedOut([["hit", "miss"], ["hit"], []]);

    expect(views.player1.results?.winner).toBe(otherPlayer(first));
  });

  it("is a draw on equal Hits and Misses, and shows every Clue's answer", async () => {
    const { views } = await playedOut([
      ["hit", "miss"],
      ["hit", "miss"],
      [],
      [],
    ]);

    expect(views.player1.results).toMatchObject({ winner: null });
    expect(views.player1.results?.clues.player1[0]).toMatchObject({
      letter: "A",
      answer: "abeja",
      result: "hit",
    });
  });
});

/** Has the Creator (Player 1) press Revancha; returns the Rematch's id. */
async function pressRevancha(
  players: Record<PlayerRole, Device>,
): Promise<string> {
  await stockUp();
  players.player1.send({ type: "rematch" });
  const { rematch } = await nextPlaying(
    players.player1,
    (view) => view.rematch !== null,
  );
  if (rematch === null) throw new Error("No Rematch");
  return rematch;
}

describe("Revancha", () => {
  it("moves every Device into a new Match, with the other Player first", async () => {
    const { players, first, views } = await playedOut([[], []]);

    const rematch = await pressRevancha(players);

    // Bea's Device is pointed to it too, not only the Creator's.
    await nextPlaying(players.player2, (view) => view.rematch === rematch);
    for (const role of ["player1", "player2"] as const) {
      // Each Device follows it with the same key, as the browser does.
      const moved = await connectDevice(rematch, players[role].key);
      expect(await moved.nextState()).toMatchObject({
        phase: "started",
        you: views[role].you,
        firstPlayer: otherPlayer(first),
        roscosReady: true,
      });
    }
  });

  it("starts the new Match's countdown once both Players are ready", async () => {
    const { players } = await playedOut([[], []]);
    const rematch = await pressRevancha(players);
    const ana = await connectDevice(rematch, players.player1.key);
    const bea = await connectDevice(rematch, players.player2.key);

    ana.send({ type: "ready" });
    bea.send({ type: "ready" });

    const view = await nextStateWhere(
      ana,
      (each) => each.phase === "started" && each.countdownMs !== null,
    );
    expect(view).toMatchObject({ phase: "started" });
  });
});
