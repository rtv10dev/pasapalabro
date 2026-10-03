import type { MatchId } from "../shared/protocol";

const storageKey = (matchId: MatchId): string =>
  `pasapalabra:show-answers:${matchId}`;

/**
 * The setting as last chosen on this page, so it survives every new view
 * even where storage is blocked (private mode).
 */
const chosen = new Map<MatchId, boolean>();

/**
 * Whether this Device has Mostrar respuestas on for the Match: off until
 * turned on, and a Rematch, being another Match, starts with it off.
 */
export function showsAnswers(matchId: MatchId): boolean {
  const known = chosen.get(matchId);
  if (known !== undefined) return known;
  try {
    return localStorage.getItem(storageKey(matchId)) === "on";
  } catch {
    // Storage blocked: off.
    return false;
  }
}

/** Remembers Mostrar respuestas for the rest of the Match on this Device. */
export function rememberShowAnswers(matchId: MatchId, on: boolean): void {
  chosen.set(matchId, on);
  try {
    if (on) localStorage.setItem(storageKey(matchId), "on");
    else localStorage.removeItem(storageKey(matchId));
  } catch {
    // Storage blocked: the setting lasts until a reload.
  }
}
