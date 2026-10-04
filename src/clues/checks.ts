import {
  CONTAINS_LETTERS,
  normalize,
  type Clue,
  type Letter,
} from "../shared/rosco";

/** Why a Clue can't go into a Rosco. */
export type ClueProblem =
  "empty-clue" | "not-one-word" | "letter-rule" | "answer-in-clue" | "repeated";

/** Answers this short are only refused in their Clue as whole words: "oso" is fine in "peligroso". */
const SHORT_ANSWER = 3;

/**
 * Checks the form of a Clue against the answers already accepted for its
 * Rosco; null if it can go in. The Word List's build runs it on every
 * definition (ADR 0005). Can't tell whether the Clue is true: that's down
 * to the dictionary and the Host.
 */
export function checkClue(
  { letter, contains, text, answer }: Clue,
  earlier: readonly string[],
): ClueProblem | null {
  if (text.trim() === "") return "empty-clue";
  const word = normalize(answer.trim());
  if (!/^[a-zñ]+$/.test(word)) return "not-one-word";
  if (!followsLetterRule(word, letter, contains)) {
    return "letter-rule";
  }
  if (givesAway(normalize(text), word)) return "answer-in-clue";
  if (earlier.some((answer) => normalize(answer.trim()) === word)) {
    return "repeated";
  }
  return null;
}

/** Whether the Clue holds the answer, or a word built on it such as its plural. */
function givesAway(text: string, answer: string): boolean {
  return text
    .split(/[^a-zñ]+/)
    .some((word) =>
      answer.length > SHORT_ANSWER ? word.startsWith(answer) : word === answer,
    );
}

/** "Empieza por" the letter, or "contiene" it where the show allows that. */
function followsLetterRule(
  answer: string,
  letter: Letter,
  contains: boolean,
): boolean {
  const wanted = normalize(letter);
  if (!contains) return answer.startsWith(wanted);
  return CONTAINS_LETTERS.includes(letter) && answer.includes(wanted);
}
