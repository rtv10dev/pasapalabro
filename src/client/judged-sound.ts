/**
 * Which sound the Host's verdict gives: pure, so it is tested without a
 * browser or audio.
 */

import type { MatchView } from "../shared/protocol";

/** The show's sounds for Acierto, Fallo and Pasapalabra. */
export const SOUNDS = ["hit", "miss", "pasapalabra"] as const;
export type Sound = (typeof SOUNDS)[number];

/**
 * The sound for the change from `previous` to `view`, on the Device of the
 * Player whose Turn was just judged; null on every other Device, when nothing
 * was judged, or without a previous view (a first load or a reload), so that
 * nothing replays. A Pasapalabra is the current letter moving on, or the
 * Turn handing over on the only letter left, with no new result.
 */
export function judgedSound(
  previous: MatchView | null,
  view: MatchView,
): Sound | null {
  if (previous?.phase !== "playing" || view.phase !== "playing") return null;
  // Only a running Turn is judged.
  if (previous.stage !== "running") return null;
  if (view.you === null || previous.roles[previous.turn] !== view.you) {
    return null;
  }
  const before = previous.roscos[previous.turn];
  const after = view.roscos[previous.turn];
  const judged = before.letters.findIndex(
    ({ letter }) => letter === before.current,
  );
  const result = after.letters[judged]?.result;
  if (result === "hit" || result === "miss") return result;
  // A Pasapalabra leaves a letter to play: a Rosco finished by its Clock
  // has none.
  if (after.current === null) return null;
  const passed = after.current !== before.current || view.stage === "handover";
  return passed ? "pasapalabra" : null;
}
