import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import * as z from "zod/mini";
import { parseBlocklist } from "../../scripts/word-list/blocklist";
import { checkClue } from "../../src/clues/checks";
import { CONTAINS_LETTERS, LETTERS } from "../../src/shared/rosco";
import {
  PREVALENCE,
  RECENT_ROSCOS,
  inRange,
  lettersFor,
} from "../../src/shared/word-list";

const fileSchema = z.object({
  licence: z.string(),
  credits: z.array(
    z.object({
      for: z.string(),
      source: z.string(),
      url: z.string(),
      licence: z.string(),
    }),
  ),
  words: z.array(
    z.object({ word: z.string(), prevalence: z.number(), clue: z.string() }),
  ),
});

const file = fileSchema.parse(
  JSON.parse(
    readFileSync(new URL("../../data/word-list.json", import.meta.url), "utf8"),
  ),
);
const { words } = file;

describe("the committed Word List", () => {
  it("states its licence and credits its three sources", () => {
    expect(file.licence).toContain("CC BY-SA 4.0");
    const credits = file.credits.map(({ source }) => source).join("\n");
    expect(credits).toContain("RLA-ES");
    expect(credits).toContain("SPALEX");
    expect(credits).toContain("Wikcionario");
  });

  it("has thousands of Words, each once", () => {
    expect(words.length).toBeGreaterThan(15_000);
    // "papa" and "papá" are two Words: the draw compares answers normalized.
    const unique = new Set(words.map(({ word }) => word));
    expect(unique.size).toBe(words.length);
  });

  it("leaves out every Word of the Blocklist", () => {
    const blocklist = parseBlocklist(
      readFileSync(
        new URL("../../data/blocklist.txt", import.meta.url),
        "utf8",
      ),
    );
    expect(blocklist.size).toBeGreaterThan(0);
    const blocked = words.filter(({ word }) => blocklist.has(word));
    expect(blocked).toEqual([]);
  });

  it("gives every Word a Prevalence between 0 and 100", () => {
    const outside = words.filter(
      ({ prevalence }) => !(prevalence >= 0 && prevalence <= 100),
    );
    expect(outside).toEqual([]);
  });

  it("gives every Word a Clue that passes the Clue checks for each letter it answers", () => {
    const failing = words.flatMap(({ word, clue }) => {
      const letters = lettersFor(word);
      if (letters.length === 0) return [{ word, problem: "no letter" }];
      return letters.flatMap((letter) => {
        const problem = checkClue(
          {
            letter,
            contains: CONTAINS_LETTERS.includes(letter),
            text: clue,
            answer: word,
          },
          [],
        );
        return problem === null ? [] : [{ word, letter, problem }];
      });
    });
    expect(failing).toEqual([]);
  });

  describe.each(Object.entries(PREVALENCE))("the %s range", (_, range) => {
    const inThisRange = words.filter(({ prevalence }) =>
      inRange(prevalence, range),
    );

    // A Match's Roscos avoid the Recent Answers and each other: at most one
    // Word per letter for each Rosco remembered and each of the Match's two.
    const needed = RECENT_ROSCOS + 2;

    // lettersFor applies "contiene" to Ñ, X and Y, "empieza por" to the rest.
    it.each(LETTERS)(
      `has at least twice the ${needed} Words for %s that a draw may need`,
      (letter) => {
        const answers = inThisRange.filter(({ word }) =>
          lettersFor(word).includes(letter),
        );
        expect(answers.length).toBeGreaterThanOrEqual(2 * needed);
      },
    );
  });
});
