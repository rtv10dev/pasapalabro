/**
 * The answer's entry on Wikcionario, where the Clue came from (ADR 0005), so
 * a Player can read the full meaning of a Word they didn't know.
 */
export function wikcionarioUrl(answer: string): string {
  const title = answer
    .normalize("NFC")
    .trim()
    .toLocaleLowerCase("es")
    .replaceAll(/\s+/g, "_");
  return `https://es.wiktionary.org/wiki/${encodeURIComponent(title)}`;
}
