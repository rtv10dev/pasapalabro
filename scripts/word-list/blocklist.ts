/**
 * The Blocklist (data/blocklist.txt) and the open lists its candidates are
 * seeded from (docs/research/offensive-words.md).
 */

/** The Words of the Blocklist: one per line, after which `#` starts a comment. */
export function parseBlocklist(text: string): Set<string> {
  return new Set(
    text
      .split("\n")
      .map((line) => line.replace(/#.*/u, "").trim())
      .filter((word) => word !== ""),
  );
}

/**
 * The entries of cuss's `es.js` with their rating: 2 for "likely" profane,
 * 1 for "maybe". A JavaScript module, so it is read, not imported.
 */
export function parseCuss(text: string): Map<string, CussRating> {
  const entries = text.matchAll(/^\s*'?([^':\n]+?)'?: ([12]),?$/gmu);
  return new Map(
    Array.from(entries, ([, word = "", rating]) => [
      word,
      rating === "2" ? 2 : 1,
    ]),
  );
}

/** How sure cuss is that a word is profane: 2 "likely", 1 "maybe". */
export type CussRating = 1 | 2;

/** The single words of LDNOOBW's `es` list, in lower case: its phrases can't be Words. */
export function parseLdnoobw(text: string): Set<string> {
  return new Set(
    text
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((word) => /^\p{L}+$/u.test(word)),
  );
}
