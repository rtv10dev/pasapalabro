import * as z from "zod/mini";
import type { Difficulty } from "../shared/protocol";
import { LETTERS, type Letter, type Rosco } from "../shared/rosco";
import { checkClue, type Candidate } from "./checks";

/** What a model is asked to write: one Clue for each of these letters. */
export interface ClueRequest {
  difficulty: Difficulty;
  letters: readonly Letter[];
  /** The letters, among the asked ones or not, that get a very hard Clue. */
  veryHard: readonly Letter[];
  /**
   * Answers the model must not use: those already in the Rosco, and those
   * it was told to avoid, such as the answers of the Match's other Rosco.
   */
  avoid: readonly string[];
}

/** A model that writes Clues; returns the model's raw reply. */
export interface Provider {
  name: string;
  write(request: ClueRequest): Promise<string>;
}

/**
 * Thrown by a Provider that can't answer right now (overloaded, rate limited,
 * timed out) but may later. The request is retried; it's never a bad Clue.
 */
export class ProviderUnavailable extends Error {
  override name = "ProviderUnavailable";
}

/** What generating a Rosco needs from outside: I/O and randomness are passed in. */
export interface Generation {
  /** Tried in order: the first one, then the next when it fails. */
  providers: readonly Provider[];
  /** A random number in [0, 1); called once per draw. */
  random: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** How many very hard Clues every Rosco has, whatever its Difficulty. */
const VERY_HARD_CLUES = 2;

/** How many other answers a Clue keeps, at most. */
export const MAX_OTHER_ANSWERS = 2;

/** How many times the model is asked for the Clues that keep failing a check. */
const ROUNDS = 3;

/** How many times each provider is tried with a request while it's unavailable. */
const ATTEMPTS = 4;
/** The wait before the first retry; it doubles before each next one. */
const FIRST_RETRY_MS = 2000;

/** The reply a model is asked for, in the prompt's Spanish. */
const replySchema = z.object({
  clues: z.array(
    z.object({
      letter: z.string(),
      type: z.enum(["empieza", "contiene"]),
      clue: z.string(),
      answer: z.string(),
      // Missing or malformed, it's none: it never makes the Clue fail.
      otherAnswers: z.catch(z.array(z.string()), []),
    }),
  ),
});

/**
 * Generates a Rosco of the given Difficulty whose Clues all pass the checks,
 * asking again for the failing ones; throws if some still fail after the
 * last round. None of its answers is one of `avoid`.
 */
export async function generateRosco(
  difficulty: Difficulty,
  { providers, random, sleep }: Generation,
  avoid: readonly string[] = [],
): Promise<Rosco> {
  const veryHard = drawVeryHard(random);
  const accepted = new Map<Letter, Candidate>();
  const used = () => [
    ...avoid,
    ...[...accepted.values()].map(({ answer }) => answer),
  ];
  for (let round = 0; round < ROUNDS; round++) {
    const letters = LETTERS.filter((letter) => !accepted.has(letter));
    if (letters.length === 0) break;
    const written = candidatesIn(
      await ask(
        { difficulty, letters, veryHard, avoid: used() },
        providers,
        sleep,
      ),
    );
    for (const letter of letters) {
      const candidate = written.get(letter);
      if (candidate && !checkClue(candidate, used())) {
        accepted.set(letter, {
          ...candidate,
          otherAnswers: checkedOtherAnswers(candidate),
        });
      }
    }
  }
  return LETTERS.map((letter) => {
    const candidate = accepted.get(letter);
    if (!candidate) throw new Error(`No valid Clue for ${letter}`);
    return { ...candidate, veryHard: veryHard.includes(letter) };
  });
}

/**
 * The reply of the first provider that answers the request. Retries an
 * unavailable one with growing waits, then falls back to the next.
 */
async function ask(
  request: ClueRequest,
  providers: readonly Provider[],
  sleep: Generation["sleep"],
): Promise<string> {
  const errors: unknown[] = [];
  for (const provider of providers) {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      try {
        return await provider.write(request);
      } catch (error) {
        errors.push(error);
        if (!(error instanceof ProviderUnavailable) || attempt === ATTEMPTS) {
          break;
        }
        await sleep(FIRST_RETRY_MS * 2 ** (attempt - 1));
      }
    }
  }
  throw new AggregateError(errors, "Every provider failed to write Clues");
}

/**
 * The Clue's first MAX_OTHER_ANSWERS other answers that pass the same checks as its answer and
 * repeat neither it nor each other. The rest are dropped: they never make
 * the Clue fail.
 */
function checkedOtherAnswers({
  otherAnswers = [],
  ...candidate
}: Candidate): string[] {
  const kept: string[] = [];
  for (const other of otherAnswers) {
    if (kept.length === MAX_OTHER_ANSWERS) break;
    const earlier = [candidate.answer, ...kept];
    if (!checkClue({ ...candidate, answer: other }, earlier)) kept.push(other);
  }
  return kept;
}

function drawVeryHard(random: () => number): Letter[] {
  const remaining = [...LETTERS];
  const drawn: Letter[] = [];
  while (drawn.length < VERY_HARD_CLUES) {
    const [letter] = remaining.splice(
      Math.floor(random() * remaining.length),
      1,
    );
    if (letter) drawn.push(letter);
  }
  return drawn;
}

/** The Clues in a model's reply, by letter; empty if the reply isn't valid. */
function candidatesIn(reply: string): Map<Letter, Candidate> {
  const candidates = new Map<Letter, Candidate>();
  let json: unknown;
  try {
    json = JSON.parse(reply);
  } catch {
    return candidates;
  }
  const parsed = replySchema.safeParse(json);
  if (!parsed.success) return candidates;
  for (const { letter: written, type, clue, answer, otherAnswers } of parsed
    .data.clues) {
    const letter = LETTERS.find(
      (each) => each === written.trim().toUpperCase(),
    );
    if (letter) {
      candidates.set(letter, {
        letter,
        contains: type === "contiene",
        text: clue.trim(),
        answer: answer.trim(),
        otherAnswers: otherAnswers.map((other) => other.trim()),
      });
    }
  }
  return candidates;
}
