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
 * The Prevalence of the Words each Difficulty draws from, and of the very
 * hard Clues every Rosco has. Starting values, to be tuned by playing.
 */
export const PREVALENCE: Record<Difficulty | "veryHard", PrevalenceRange> = {
  easy: { min: 97, max: Infinity },
  normal: { min: 85, max: 97 },
  hard: { min: 60, max: 85 },
  veryHard: { min: 0, max: 40 },
};

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
  return LETTERS.filter((letter) =>
    CONTAINS_LETTERS.includes(letter)
      ? normalized.includes(normalize(letter))
      : normalized.startsWith(normalize(letter)),
  );
}
