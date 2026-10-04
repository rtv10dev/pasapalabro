import type { Rosco } from "../shared/rosco";
import { RECENT_ROSCOS } from "../shared/word-list";

/** The answers of the last Roscos drawn for a Difficulty, one list per Rosco, oldest first. */
export type AnswersByRosco = readonly (readonly string[])[];

/**
 * The Recent Answers once these Roscos are drawn: their answers after the
 * earlier ones, keeping only the last RECENT_ROSCOS Roscos.
 */
export function remember(
  recent: AnswersByRosco,
  roscos: readonly Rosco[],
): AnswersByRosco {
  const drawn = roscos.map((rosco) => rosco.map(({ answer }) => answer));
  return [...recent, ...drawn].slice(-RECENT_ROSCOS);
}
