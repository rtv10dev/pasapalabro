import type { Difficulty } from "./protocol";
import { CONTAINS_LETTERS, LETTERS, normalize, type Letter } from "./rosco";

/** An entry of the Word List: a possible answer and its Clue (ADR 0005). */
export interface Word {
  word: string;
  /** The share of people in Spain who know the Word, 0–100 (SPALEX). */
  prevalence: number;
  /** The dictionary definition the Host reads aloud. */
  clue: string;
}

/** The Prevalence a Word needs to be drawn: at least `min`, below `max`. */
export interface PrevalenceRange {
  min: number;
  max: number;
}

/**
 * The Prevalence of the Words each Difficulty draws from. Starting values,
 * to be tuned by playing.
 */
export const PREVALENCE: Record<Difficulty, PrevalenceRange> = {
  easy: { min: 97, max: Infinity },
  normal: { min: 85, max: 97 },
  hard: { min: 60, max: 85 },
};

/**
 * How many Roscos of a Difficulty the Recent Answers remember, so their
 * answers aren't drawn again. A Match's Rosco avoids these and the Match's
 * other Rosco, each taking one Word per letter; every letter's band must
 * hold twice that many, so a draw never runs out. The Word List's data
 * test checks it, and names the smallest band when it fails.
 */
export const RECENT_ROSCOS = 4;

/** Whether a Word with this Prevalence is in the range. */
export function inRange(
  prevalence: number,
  { min, max }: PrevalenceRange,
): boolean {
  return prevalence >= min && prevalence < max;
}

/**
 * The letters of the Rosco the Word can answer: the one it starts with, and
 * Ñ, X or Y wherever it contains them, as those Clues are "contiene".
 */
export function lettersFor(word: string): Letter[] {
  const normalized = normalize(word);
  return NORMALIZED_LETTERS.filter(({ letter, form }) =>
    CONTAINS_LETTERS.includes(letter)
      ? normalized.includes(form)
      : normalized.startsWith(form),
  ).map(({ letter }) => letter);
}

/** LETTERS normalized, once: indexing the Word List calls lettersFor for every Word. */
const NORMALIZED_LETTERS = LETTERS.map((letter) => ({
  letter,
  form: normalize(letter),
}));
