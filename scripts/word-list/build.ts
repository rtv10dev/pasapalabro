/**
 * Builds the Word List (ADR 0005) from its open sources and writes it to
 * data/word-list.json. Run by hand with `npm run build:word-list`; never part
 * of a deploy or a test run. Needs `bzcat` for the Wikcionario dump.
 * Leaves out the Words of the Blocklist (data/blocklist.txt).
 */
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { PREVALENCE, inRange, type Word } from "../../src/shared/word-list";
import { parseBlocklist } from "./blocklist";
import { checkSense, pickClue, pickOtherAnswers } from "./senses";
import { CACHE, download, readSenses, readWords } from "./sources";
import { citationsBySense } from "./wikitext";

const OUTPUT = "data/word-list.json";
const BLOCKLIST = "data/blocklist.txt";

const SPALEX = "https://ndownloader.figshare.com/files/11826623";
const WIKCIONARIO_DUMP =
  "https://dumps.wikimedia.org/eswiktionary/latest/eswiktionary-latest-pages-articles.xml.bz2";

const LICENCE =
  "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). Built by scripts/word-list/build.ts from the sources credited below; the definitions were selected and their spacing normalised.";

const CREDITS = [
  {
    for: "Words",
    source:
      "RLA-ES, Recursos Lingüísticos Abiertos del Español (es_ES Hunspell lists), Santiago Bosio and contributors",
    url: "https://github.com/sbosio/rla-es",
    licence: "MPL-1.1 (https://www.mozilla.org/en-US/MPL/1.1/)",
  },
  {
    for: "Prevalence",
    source:
      "SPALEX: Aguasvivas, Carreiras, Brysbaert, Mandera, Keuleers and Duñabeitia (2018), Frontiers in Psychology 9:2156, https://doi.org/10.3389/fpsyg.2018.02156; Spain figure (percent_nts)",
    url: "https://figshare.com/articles/dataset/Word_information/5924794",
    licence: "CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)",
  },
  {
    for: "Clues",
    source:
      "Wikcionario contributors, each Word's entry at https://es.wiktionary.org/wiki/<Word>; extracted with wiktextract by kaikki.org (Ylonen 2022)",
    url: "https://kaikki.org/eswiktionary/",
    licence: "CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/)",
  },
];

/** Reads the sources, picks each Word's Clue and writes the Word List. */
async function main(): Promise<void> {
  await mkdir(CACHE, { recursive: true });

  const partsOfSpeech = await readWords();
  console.log(
    `RLA-ES: ${partsOfSpeech.size} nouns, adjectives and infinitives`,
  );

  const prevalence = await readPrevalence(partsOfSpeech);
  console.log(`SPALEX: ${prevalence.size} of them with a Prevalence`);

  const citations = await readCitations(new Set(prevalence.keys()));
  const senses = await readSenses(partsOfSpeech, prevalence, citations);
  console.log(`Wikcionario: ${senses.size} of them with an entry`);

  const blocklist = parseBlocklist(await readFile(BLOCKLIST, "utf8"));

  const words: Word[] = [];
  const dropped = new Map<string, number>();
  for (const [word, percent] of prevalence) {
    if (blocklist.has(word)) {
      dropped.set("blocklist", (dropped.get("blocklist") ?? 0) + 1);
      continue;
    }
    const wordSenses = senses.get(word) ?? [];
    const clue = pickClue(word, wordSenses);
    if (clue === null) {
      const first = wordSenses[0];
      const why =
        first === undefined
          ? "no definition"
          : `first: ${checkSense(word, first) ?? "?"}`;
      dropped.set(why, (dropped.get(why) ?? 0) + 1);
      continue;
    }
    words.push({ word, prevalence: Math.round(percent * 10) / 10, clue });
  }
  words.sort((one, other) => one.word.localeCompare(other.word, "es"));

  // Other answers must be Words themselves, so they wait for every Clue.
  const inWordList = new Set(words.map(({ word }) => word));
  for (const word of words) {
    const otherAnswers = pickOtherAnswers(
      word.word,
      senses.get(word.word) ?? [],
      inWordList,
    );
    if (otherAnswers.length > 0) word.otherAnswers = otherAnswers;
  }

  await writeWordList(words);
  console.log(`Wrote ${words.length} Words to ${OUTPUT}`);
  const withOthers = words.filter(({ otherAnswers }) => otherAnswers).length;
  console.log(`${withOthers} of them with other answers`);
  console.log("Left out:", Object.fromEntries(dropped));
  for (const [name, range] of Object.entries(PREVALENCE)) {
    const count = words.filter(({ prevalence }) =>
      inRange(prevalence, range),
    ).length;
    console.log(`${name}: ${count} Words`);
  }
}

/** The Spain Prevalence of each Word that SPALEX scores. */
async function readPrevalence(
  words: ReadonlyMap<string, unknown>,
): Promise<Map<string, number>> {
  const file = await download(SPALEX, "spalex-word_info.csv");
  const [header = "", ...rows] = (await readFile(file, "utf8")).split("\n");
  const columns = header.trim().split(",");
  const spellingColumn = columns.indexOf("spelling");
  const spainColumn = columns.indexOf("percent_nts");
  if (spellingColumn < 0 || spainColumn < 0)
    throw new Error(`SPALEX columns: ${header}`);
  const prevalence = new Map<string, number>();
  for (const row of rows) {
    const cells = row.trim().split(",");
    const word = cells[spellingColumn] ?? "";
    const percent = Number(cells[spainColumn]);
    if (words.has(word) && Number.isFinite(percent)) {
      prevalence.set(word, percent);
    }
  }
  return prevalence;
}

/**
 * The dictionaries each sense of the Words cites, by Word and sense number,
 * read from the references in the Wikcionario dump (kaikki's extract drops them).
 */
async function readCitations(
  words: ReadonlySet<string>,
): Promise<Map<string, Map<string, string[]>>> {
  const file = await download(WIKCIONARIO_DUMP, "eswiktionary.xml.bz2");
  const bzcat = spawn("bzcat", [file], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const citations = new Map<string, Map<string, string[]>>();
  let title = "";
  let text: string[] | null = null;
  for await (const line of createInterface({ input: bzcat.stdout })) {
    const titled = /<title>(.*)<\/title>/u.exec(line);
    if (titled) {
      title = unescapeXml(titled[1] ?? "");
      continue;
    }
    if (!words.has(title)) continue;
    if (line.includes("<text")) text = [];
    if (text === null) continue;
    // The page's first and last lines share a line with the XML tags.
    text.push(line.replace(/^.*<text[^>]*>/u, "").replace(/<\/text>.*$/u, ""));
    if (line.includes("</text>")) {
      citations.set(title, citationsBySense(unescapeXml(text.join("\n"))));
      text = null;
    }
  }
  return citations;
}

function unescapeXml(text: string): string {
  return text
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replaceAll("&amp;", "&");
}

/** One Word per line, so that a rebuild shows up as a readable diff. */
async function writeWordList(words: readonly Word[]): Promise<void> {
  const head = JSON.stringify({ licence: LICENCE, credits: CREDITS }, null, 2);
  const lines = words.map((word) => `    ${JSON.stringify(word)}`);
  await writeFile(
    OUTPUT,
    `${head.slice(0, -2)},\n  "words": [\n${lines.join(",\n")}\n  ]\n}\n`,
  );
}

await main();
