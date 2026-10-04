import { describe, expect, it } from "vitest";
import { drawRosco, drawRoscos } from "../../src/clues/draw";
import type { Difficulty } from "../../src/shared/protocol";
import {
  CONTAINS_LETTERS,
  LETTERS,
  normalize,
  type Letter,
} from "../../src/shared/rosco";
import type { Word } from "../../src/shared/word-list";

type Band = Difficulty | "none";

/**
 * Each letter's Words in the tiny Word List, by the band their Prevalence
 * falls in; "none" is below the hard band, so never drawn. Every value sits
 * on the edge of its band.
 */
const WORDS_PER_LETTER: { suffix: string; prevalence: number; band: Band }[] = [
  { suffix: "media", prevalence: 50, band: "none" },
  { suffix: "fácil", prevalence: 97, band: "easy" },
  { suffix: "facilísima", prevalence: 100, band: "easy" },
  { suffix: "normal", prevalence: 85, band: "normal" },
  { suffix: "difícil", prevalence: 60, band: "hard" },
  { suffix: "rara", prevalence: 59.9, band: "none" },
];

/**
 * The stem of the letter's Words: they start with it, or for Ñ, X and Y
 * contain it after a K, which no Rosco letter answers.
 */
function stem(letter: Letter): string {
  const lower = letter.toLocaleLowerCase("es");
  return CONTAINS_LETTERS.includes(letter) ? `k${lower}` : lower;
}

const BANDS = new Map<string, Band>();
const WORDS: Word[] = LETTERS.flatMap((letter) =>
  WORDS_PER_LETTER.map(({ suffix, prevalence, band }) => {
    const word = `${stem(letter)}${suffix}`;
    BANDS.set(word, band);
    return { word, prevalence, clue: `Definición de ${word}` };
  }),
);

/** Randomness that always gives the same number. */
function always(value: number): () => number {
  return () => value;
}

const DIFFICULTIES: Difficulty[] = ["easy", "normal", "hard"];

describe("drawRosco", () => {
  it("draws one Clue per letter, in order, each a Word with its definition", () => {
    const rosco = drawRosco(WORDS, "easy", [], always(0));

    expect(rosco.map(({ letter }) => letter)).toEqual(LETTERS);
    for (const clue of rosco) {
      expect(clue.answer.startsWith(stem(clue.letter))).toBe(true);
      expect(clue.text).toBe(`Definición de ${clue.answer}`);
      expect(clue.otherAnswers).toEqual([]);
    }
  });

  it("has Ñ, X and Y contain their letter, and every other letter start with it", () => {
    const rosco = drawRosco(WORDS, "normal", [], always(0.5));

    for (const { letter, contains } of rosco) {
      expect(contains).toBe(CONTAINS_LETTERS.includes(letter));
    }
  });

  it.each(DIFFICULTIES)("draws only %s Words", (difficulty) => {
    for (const value of [0, 0.3, 0.99]) {
      const rosco = drawRosco(WORDS, difficulty, [], always(value));

      for (const { answer } of rosco) {
        expect(BANDS.get(answer)).toBe(difficulty);
      }
    }
  });

  it("picks the Words by the randomness", () => {
    const first = drawRosco(WORDS, "easy", [], always(0));
    const last = drawRosco(WORDS, "easy", [], always(0.99));

    expect(first[2]?.answer).toBe("cfácil");
    expect(last[2]?.answer).toBe("cfacilísima");
  });

  it("never draws an avoided answer, compared without accents or case", () => {
    const rosco = drawRosco(
      WORDS,
      "easy",
      ["CFÁCIL", "dfacilisima"],
      // Each Word is the first left.
      always(0),
    );

    expect(rosco[2]?.answer).toBe("cfacilísima");
    expect(rosco[3]?.answer).toBe("dfácil");
  });

  it("never draws the same answer for two letters", () => {
    // The only easy Word for X also answers Y, and comes first.
    const words: Word[] = [
      { word: "kxy", prevalence: 99, clue: "Definición de kxy" },
      ...WORDS.filter(
        ({ word }) => word !== "kxfácil" && word !== "kxfacilísima",
      ),
    ];

    const rosco = drawRosco(words, "easy", [], always(0));

    const y = rosco.find(({ letter }) => letter === "Y");
    expect(rosco.find(({ letter }) => letter === "X")?.answer).toBe("kxy");
    expect(y?.answer).toBe("kyfácil");
  });

  it("throws when a letter has no Word left in its band", () => {
    expect(() => drawRosco(WORDS, "normal", ["qnormal"], always(0.5))).toThrow(
      /Q/,
    );
  });
});

describe("drawRoscos", () => {
  it("draws a Match's two Roscos, which share no answer", () => {
    // The same randomness would draw the same Words twice.
    const [first, second] = drawRoscos(WORDS, "easy", [], always(0));

    expect(first.map(({ letter }) => letter)).toEqual(LETTERS);
    expect(second.map(({ letter }) => letter)).toEqual(LETTERS);
    const answers = new Set(first.map(({ answer }) => normalize(answer)));
    expect(
      second.filter(({ answer }) => answers.has(normalize(answer))),
    ).toEqual([]);
  });

  it("never draws an avoided answer in either Rosco", () => {
    // A third easy Word for C, so both Roscos have one left.
    const words: Word[] = [
      ...WORDS,
      { word: "cfacilona", prevalence: 98, clue: "Definición de cfacilona" },
    ];

    const [first, second] = drawRoscos(words, "easy", ["cfácil"], always(0));

    expect(first[2]?.answer).toBe("cfacilísima");
    expect(second[2]?.answer).toBe("cfacilona");
  });
});
