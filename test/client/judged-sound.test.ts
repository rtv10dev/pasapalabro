import { describe, expect, it } from "vitest";
import { judgedSound } from "../../src/client/judged-sound";
import type {
  LetterResult,
  MemberId,
  PlayingView,
  RoscoView,
} from "../../src/shared/protocol";

/** The Members of the Match: the Host and the two Players. */
const HOST = 1;
const PLAYER1 = 2;
const PLAYER2 = 3;

/** A Rosco of three letters, the first `results` answered as given. */
function rosco(
  results: LetterResult[],
  current: "A" | "B" | "C" | null,
): RoscoView {
  const letters = (["A", "B", "C"] as const).map((letter, index) => ({
    letter,
    result: results[index] ?? "pending",
  }));
  return { letters, current, clockMs: 60_000, finished: current === null };
}

/** Player 1's Turn running on their first letter, as seen by `you`. */
function running(you: MemberId): PlayingView {
  return {
    phase: "playing",
    settings: { difficulty: "normal", clockSeconds: 180, hosted: true },
    members: [
      { id: HOST, name: "Ana", connected: true },
      { id: PLAYER1, name: "Bea", connected: true },
      { id: PLAYER2, name: "Carla", connected: true },
    ],
    creator: HOST,
    roles: { host: HOST, player1: PLAYER1, player2: PLAYER2 },
    you,
    turn: "player1",
    turnHost: HOST,
    stage: "running",
    handoverMs: null,
    handoverFrom: null,
    tallyShown: false,
    roscos: { player1: rosco([], "A"), player2: rosco([], "A") },
    clue: null,
    pause: null,
    revealed: null,
    results: null,
    rematch: null,
  };
}

/** The Handover after Player 1's Turn, to Player 2's. */
function handedOver(before: PlayingView): PlayingView {
  return {
    ...before,
    turn: "player2",
    stage: "handover",
    handoverMs: 3000,
    handoverFrom: "player1",
  };
}

describe("judgedSound", () => {
  it("is a Hit on the Player's Device when their letter turns green", () => {
    const before = running(PLAYER1);
    const after: PlayingView = {
      ...before,
      roscos: { ...before.roscos, player1: rosco(["hit"], "B") },
    };
    expect(judgedSound(before, after)).toBe("hit");
  });

  it("is a Miss on the Player's Device when their letter turns red", () => {
    const before = running(PLAYER1);
    const after: PlayingView = {
      ...handedOver(before),
      revealed: { letter: "A", answer: "Abeja" },
      roscos: { ...before.roscos, player1: rosco(["miss"], "B") },
    };
    expect(judgedSound(before, after)).toBe("miss");
  });

  it("is a Pasapalabra on the Player's Device when their letter moves on unanswered", () => {
    const before = running(PLAYER1);
    const after: PlayingView = {
      ...handedOver(before),
      roscos: { ...before.roscos, player1: rosco([], "B") },
    };
    expect(judgedSound(before, after)).toBe("pasapalabra");
  });

  it("is a Pasapalabra on the only letter left, when the Turn passes on", () => {
    const before: PlayingView = {
      ...running(PLAYER1),
      roscos: { player1: rosco(["hit", "miss"], "C"), player2: rosco([], "A") },
    };
    const after = handedOver(before);
    expect(judgedSound(before, after)).toBe("pasapalabra");
  });

  it.each([
    ["the Host", HOST],
    ["the waiting Player", PLAYER2],
  ])("is none on the Device of %s", (_, you) => {
    const before = running(you);
    const after: PlayingView = {
      ...before,
      roscos: { ...before.roscos, player1: rosco(["hit"], "B") },
    };
    expect(judgedSound(before, after)).toBeNull();
  });

  it("is none without a previous view, so a reload replays nothing", () => {
    const view: PlayingView = {
      ...running(PLAYER1),
      roscos: { player1: rosco(["hit"], "B"), player2: rosco([], "A") },
    };
    expect(judgedSound(null, view)).toBeNull();
  });

  it("is a Miss for the last Player standing, whose Turn stays with them", () => {
    const before: PlayingView = {
      ...running(PLAYER1),
      roscos: {
        player1: rosco([], "A"),
        player2: rosco(["hit", "miss", "hit"], null),
      },
    };
    const after: PlayingView = {
      ...handedOver(before),
      turn: "player1",
      revealed: { letter: "A", answer: "Abeja" },
      roscos: { ...before.roscos, player1: rosco(["miss"], "B") },
    };
    expect(judgedSound(before, after)).toBe("miss");
  });

  it("is none when something else changes during a Handover", () => {
    const before = handedOver(running(PLAYER2));
    const after: PlayingView = {
      ...before,
      members: before.members.map((member) => ({
        ...member,
        connected: member.id !== HOST,
      })),
    };
    expect(judgedSound(before, after)).toBeNull();
  });

  it("is none when the Clock runs out, which finishes the Rosco", () => {
    const before = running(PLAYER1);
    const after: PlayingView = {
      ...handedOver(before),
      roscos: {
        ...before.roscos,
        player1: { ...rosco([], null), clockMs: 0 },
      },
    };
    expect(judgedSound(before, after)).toBeNull();
  });
});
