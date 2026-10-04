/**
 * Lists the Words of the Word List that may belong on the Blocklist, for the
 * maintainer to review by hand (docs/research/offensive-words.md). Run with
 * `npm run candidates:blocklist`; it writes .word-list/blocklist-candidates.txt.
 *
 * A Word is a candidate when cuss rates it 2, LDNOOBW lists it, one of its
 * Wikcionario senses is vulgar or offensive in Spain, or the sense that is
 * its Clue is derogatory. The review rule: block only slurs and clearly
 * vulgar Words; a Word whose Clue is its ordinary meaning stays. Blocked
 * Words leave the Word List, so a later run lists only the Words still in it.
 */
import { readFile, writeFile } from "node:fs/promises";
import * as z from "zod/mini";
import { parseCuss, parseLdnoobw } from "./blocklist";
import {
  isDerogatory,
  isOffensiveInSpain,
  pickClue,
  type Sense,
} from "./senses";
import { CACHE, download, readSenses, readWords } from "./sources";

const WORD_LIST = "data/word-list.json";
const OUTPUT = `${CACHE}/blocklist-candidates.txt`;

/** Pinned to the commits of their last change, so that the candidates don't change unnoticed. */
const CUSS =
  "https://raw.githubusercontent.com/wooorm/cuss/d14479ad4ab7b42e63e1634e16c68c71cd8d9dbb/es.js";
const LDNOOBW =
  "https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/4bafa7195ed0674d2c970e0209045f155987141e/es";

const wordListSchema = z.object({
  words: z.array(
    z.object({ word: z.string(), prevalence: z.number(), clue: z.string() }),
  ),
});

interface Candidate {
  word: string;
  prevalence: number;
  clue: string;
  /** Why it is a candidate: "cuss 2", "LDNOOBW", "Wikcionario vulgar"… */
  reasons: string[];
  /** Its senses that are vulgar or offensive in Spain. */
  offensive: Sense[];
}

async function main(): Promise<void> {
  const { words } = wordListSchema.parse(
    JSON.parse(await readFile(WORD_LIST, "utf8")),
  );
  const cuss = parseCuss(
    await readFile(await download(CUSS, "cuss-es.js"), "utf8"),
  );
  const ldnoobw = parseLdnoobw(
    await readFile(await download(LDNOOBW, "ldnoobw-es.txt"), "utf8"),
  );

  const inWordList = new Map(words.map((word) => [word.word, word]));
  // The Clue is already chosen: the RAE citations that helped choose it aren't needed.
  const senses = await readSenses(await readWords(), inWordList, new Map());

  const candidates: Candidate[] = [];
  for (const { word, prevalence, clue } of words) {
    const wordSenses = senses.get(word) ?? [];
    const offensive = wordSenses.filter(isOffensiveInSpain);
    const clueSense = wordSenses.find(
      (sense) => pickClue(word, [sense]) === clue,
    );
    const reasons = [
      cuss.get(word) === 2 ? "cuss 2" : null,
      ldnoobw.has(word) ? "LDNOOBW" : null,
      offensive.length > 0 ? "Wikcionario vulgar" : null,
      clueSense !== undefined && isDerogatory(clueSense)
        ? "Clue despectivo"
        : null,
    ].filter((reason) => reason !== null);
    if (reasons.length > 0) {
      candidates.push({ word, prevalence, clue, reasons, offensive });
    }
  }

  await writeFile(OUTPUT, candidates.map(describe).join("\n"));
  console.log(`Wrote ${candidates.length} candidates to ${OUTPUT}`);
}

/**
 * A candidate as the maintainer reviews it: what it is, why it was flagged,
 * and the Clue the game would read, then the Word itself to copy into the
 * Blocklist.
 */
function describe({
  word,
  prevalence,
  clue,
  reasons,
  offensive,
}: Candidate): string {
  const lines = [
    `# ${word} · ${prevalence} % · ${reasons.join(", ")}`,
    `#   Clue: ${clue}`,
    ...offensive.map(
      ({ gloss, tags }) => `#   ${tags.join(", ")}: ${gloss.slice(0, 120)}`,
    ),
    word,
    "",
  ];
  return lines.join("\n");
}

await main();
