/** The letters of a Rosco, in order: A–Z with Ñ, without K and W, as on the show. */
// prettier-ignore
export const LETTERS = [
  "A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "L", "M", "N",
  "Ñ", "O", "P", "Q", "R", "S", "T", "U", "V", "X", "Y", "Z",
] as const;
export type Letter = (typeof LETTERS)[number];

/** The letters whose Clue may be "contiene" instead of "empieza por". */
export const CONTAINS_LETTERS: readonly Letter[] = ["Ñ", "X", "Y"];

/** The most other answers a Clue lists, so the Host takes them in at a glance. */
export const MAX_OTHER_ANSWERS = 2;

export interface Clue {
  letter: Letter;
  /** True for "contiene", false for "empieza por". */
  contains: boolean;
  /** The statement the Host reads aloud. */
  text: string;
  answer: string;
  /**
   * Up to MAX_OTHER_ANSWERS other answers with the same letter that the Host can also
   * accept. Missing in a Clue stored before they existed: read it as none.
   */
  otherAnswers?: string[];
}

/** One Clue per letter, in the order of LETTERS. */
export type Rosco = Clue[];

/** Lower case and without accents, but with Ñ kept apart from N. */
export function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLocaleLowerCase("es")
    .split("ñ")
    .map((part) => part.normalize("NFD").replace(/\p{M}/gu, ""))
    .join("ñ");
}
