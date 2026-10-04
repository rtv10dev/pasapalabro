import type { Difficulty } from "../shared/protocol";
import {
  CONTAINS_LETTERS,
  LETTERS,
  normalize,
  type Letter,
  type Rosco,
} from "../shared/rosco";
import {
  inRange,
  lettersFor,
  PREVALENCE,
  type Word,
} from "../shared/word-list";

/** How many very hard Clues every Rosco has, whatever its Difficulty. */
const VERY_HARD_CLUES = 2;

/** A Word, with its answer normalized as answers are compared. */
interface IndexedWord {
  word: Word;
  normalized: string;
}

/** Each Word List's Words by the letters they answer, built on its first draw. */
const indexes = new WeakMap<readonly Word[], Map<Letter, IndexedWord[]>>();

/**
 * Draws a Rosco from the Word List (ADR 0005): for each letter a Word of the
 * Difficulty, except two letters, picked at random, that get a very hard
 * one. Ñ, X and Y get a Word that contains them; every other letter, one
 * that starts with it. Never draws one of `avoid`, nor the same answer
 * twice, compared normalized. `random` gives a number in [0, 1) and is
 * called once per pick. Throws if a letter has no Word left to draw.
 */
export function drawRosco(
  words: readonly Word[],
  difficulty: Difficulty,
  avoid: readonly string[],
  random: () => number,
): Rosco {
  const byLetter = indexOf(words);
  const veryHard = pick([...LETTERS], VERY_HARD_CLUES, random);
  const used = new Set(avoid.map((answer) => normalize(answer.trim())));
  return LETTERS.map((letter) => {
    const hard = veryHard.includes(letter);
    const range = PREVALENCE[hard ? "veryHard" : difficulty];
    const left = (byLetter.get(letter) ?? []).filter(
      ({ word, normalized }) =>
        inRange(word.prevalence, range) && !used.has(normalized),
    );
    const [drawn] = pick(left, 1, random);
    if (!drawn) throw new Error(`No Word left to draw for ${letter}`);
    used.add(drawn.normalized);
    return {
      letter,
      contains: CONTAINS_LETTERS.includes(letter),
      text: drawn.word.clue,
      answer: drawn.word.word,
      otherAnswers: [],
      veryHard: hard,
    };
  });
}

/**
 * Draws a Match's two Roscos from the Word List, the second avoiding the
 * first one's answers so the two never share one.
 */
export function drawRoscos(
  words: readonly Word[],
  difficulty: Difficulty,
  random: () => number,
): [Rosco, Rosco] {
  const first = drawRosco(words, difficulty, [], random);
  const avoid = first.map(({ answer }) => answer);
  return [first, drawRosco(words, difficulty, avoid, random)];
}

/** The Word List's Words by the letters they answer, in the list's order. */
function indexOf(words: readonly Word[]): Map<Letter, IndexedWord[]> {
  const cached = indexes.get(words);
  if (cached) return cached;
  const index = new Map<Letter, IndexedWord[]>();
  for (const word of words) {
    const candidate = { word, normalized: normalize(word.word.trim()) };
    for (const letter of lettersFor(word.word)) {
      const forLetter = index.get(letter) ?? [];
      forLetter.push(candidate);
      index.set(letter, forLetter);
    }
  }
  indexes.set(words, index);
  return index;
}

/** Up to `count` items taken at random from `items`, which it empties of them. */
function pick<T>(items: T[], count: number, random: () => number): T[] {
  const picked: T[] = [];
  while (picked.length < count && items.length > 0) {
    const [item] = items.splice(Math.floor(random() * items.length), 1);
    if (item !== undefined) picked.push(item);
  }
  return picked;
}
