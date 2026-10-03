import { CONTAINS_LETTERS, LETTERS, type Letter } from "../../src/shared/rosco";

/** A valid answer for each letter; X, Y and Ñ are "contiene". */
const ANSWERS: Record<Letter, string> = {
  A: "abeja", B: "ballena", C: "caracol", D: "delfín", E: "elefante",
  F: "foca", G: "gato", H: "hormiga", I: "iguana", J: "jirafa",
  L: "león", M: "mono", N: "nutria", Ñ: "araña", O: "oveja", P: "pato",
  Q: "queso", R: "rana", S: "sapo", T: "tigre", U: "urraca", V: "vaca",
  X: "taxi", Y: "playa", Z: "zorro",
}; // prettier-ignore

/** A Clue as a model writes it, in the prompt's Spanish format. */
export interface ModelClue {
  letter: string;
  type: "empieza" | "contiene";
  clue: string;
  answer: string;
  otherAnswers?: unknown;
}

/** A Clue for the letter that passes every check, unless given a wrong answer. */
export function modelClue(
  letter: Letter,
  answer: string = ANSWERS[letter],
): ModelClue {
  return {
    letter,
    type: CONTAINS_LETTERS.includes(letter) ? "contiene" : "empieza",
    clue: `Definición número ${LETTERS.indexOf(letter)}`,
    answer,
  };
}

/** A model's reply with the given Clues. */
export function modelReply(clues: ModelClue[]): string {
  return JSON.stringify({ clues });
}

/** The reply of a model that gets every Clue of a Rosco right. */
export const GOOD_REPLY = modelReply(
  LETTERS.map((letter) => modelClue(letter)),
);
