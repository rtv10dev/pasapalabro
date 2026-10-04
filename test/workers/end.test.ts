import { describe, expect, it } from "vitest";
import type { PlayerRole } from "../../src/shared/protocol";
import { LETTERS, normalize } from "../../src/shared/rosco";
import { WORDS } from "../../src/worker/word-list";
import {
  connectDevice,
  nextPlaying,
  nextStateWhere,
  otherPlayer,
  playedOut,
  type Device,
} from "./helpers";

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
      result: "hit",
    });
  });
});

describe("the Roscos of a Match", () => {
  it("are drawn from the Word List when it is created, and share no answer", async () => {
    // Both Players' Clocks run out: the Results show both Roscos.
    const { views } = await playedOut([[], []]);

    const results = views.player1.results;
    if (!results) throw new Error("No Results");
    const { player1, player2 } = results.clues;
    const words = new Map(WORDS.map(({ word, clue }) => [word, clue]));
    for (const rosco of [player1, player2]) {
      expect(rosco.map(({ letter }) => letter)).toEqual(LETTERS);
      for (const { answer, text } of rosco) {
        expect(words.get(answer)).toBe(text);
      }
    }
    const first = new Set(player1.map(({ answer }) => normalize(answer)));
    const shared = player2.filter(({ answer }) => first.has(normalize(answer)));
    expect(shared).toEqual([]);
  });
});

/** Has the Creator (Player 1) press Revancha; returns the Rematch's id. */
async function pressRevancha(
  players: Record<PlayerRole, Device>,
): Promise<string> {
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
