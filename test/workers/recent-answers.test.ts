import { describe, expect, it } from "vitest";
import type { Difficulty, Settings } from "../../src/shared/protocol";
import { normalize } from "../../src/shared/rosco";
import { RECENT_ROSCOS } from "../../src/shared/word-list";
import { playedOut, postMatch, UNHOSTED } from "./helpers";

/**
 * The answers of a new Match of the Difficulty, normalized as answers are
 * compared: its Roscos, read from the Results once both Clocks run out.
 */
async function answersOfAMatch(difficulty: Difficulty): Promise<string[]> {
  const { views } = await playedOut([[], []], difficulty);
  const results = views.player1.results;
  if (!results) throw new Error("No Results");
  const { player1, player2 } = results.clues;
  return [...player1, ...player2].map(({ answer }) => normalize(answer));
}

/** The answers that appear more than once. */
function repeated(answers: readonly string[]): string[] {
  return answers.filter((answer, index) => answers.indexOf(answer) !== index);
}

/** How many Matches the Recent Answers remember all of: two Roscos each. */
const REMEMBERED_MATCHES = Math.floor(RECENT_ROSCOS / 2);

describe("the Recent Answers", () => {
  it(`keep consecutive Matches of a Difficulty from sharing an answer while ${RECENT_ROSCOS} Roscos are remembered`, async () => {
    const answers: string[] = [];
    for (let match = 0; match <= REMEMBERED_MATCHES; match += 1) {
      answers.push(...(await answersOfAMatch("hard")));
    }

    expect(repeated(answers)).toEqual([]);
  });

  // The bands don't overlap, so one Difficulty can only restrict another by
  // pushing its answers out of the Recent Answers.
  it("of one Difficulty aren't pushed out by Matches of another", async () => {
    const first = await answersOfAMatch("hard");
    for (let match = 0; match < REMEMBERED_MATCHES; match += 1) {
      await answersOfAMatch("easy");
    }

    const next = await answersOfAMatch("hard");

    expect(repeated([...first, ...next])).toEqual([]);
  });

  it("aren't used up by Matches refused when created", async () => {
    const first = await answersOfAMatch("hard");
    const settings: Settings = { ...UNHOSTED, difficulty: "hard" };
    for (let refused = 0; refused < RECENT_ROSCOS; refused += 1) {
      const response = await postMatch({
        settings,
        creator: { name: " ", device: crypto.randomUUID() },
      });
      expect(response.status).toBe(400);
    }

    const next = await answersOfAMatch("hard");

    expect(repeated([...first, ...next])).toEqual([]);
  });
});
