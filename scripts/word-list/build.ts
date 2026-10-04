/**
 * Builds the Word List (ADR 0005) from its open sources and writes it to
 * data/word-list.json. Run by hand with `npm run build:word-list`; never part
 * of a deploy or a test run. Needs `bzcat` for the Wikcionario dump.
 *
 * Downloads go to .word-list/ and are reused by later runs: delete the folder
 * to fetch fresh sources.
 */
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import * as z from "zod/mini";
import { PREVALENCE, inRange, type Word } from "../../src/shared/word-list";
import { checkSense, pickClue, type Sense } from "./senses";
import { citationsBySense } from "./wikitext";

const CACHE = ".word-list";
const OUTPUT = "data/word-list.json";

/** Pinned to a commit (2026-09-19), so that rebuilding doesn't change the Words unnoticed. */
const RLA_ES =
  "https://raw.githubusercontent.com/sbosio/rla-es/fb279606e9ad229b9d892b0344fbb8d4ee8c47ca/ortografia/palabras/RAE/";
const SPALEX = "https://ndownloader.figshare.com/files/11826623";
const KAIKKI = "https://kaikki.org/eswiktionary/raw-wiktextract-data.jsonl.gz";
const WIKCIONARIO_DUMP =
  "https://dumps.wikimedia.org/eswiktionary/latest/eswiktionary-latest-pages-articles.xml.bz2";

type PartOfSpeech = "noun" | "adj" | "verb";

/** The RLA-ES lists of common nouns, adjectives and infinitives; proper nouns and place names live elsewhere. */
const RLA_ES_LISTS: Record<string, PartOfSpeech> = {
  "Adjetivos.txt": "adj",
  "NombresAmbiguos.txt": "noun",
  "NombresComunes.txt": "noun",
  "NombresFemeninos.txt": "noun",
  "NombresMasculinos.txt": "noun",
  "NombresMasculinosFemeninos.txt": "noun",
  "VerbosIntransitivos.txt": "verb",
  "VerbosIntransitivosPronominales.txt": "verb",
  "VerbosPronominales.txt": "verb",
  "VerbosTransitivos.txt": "verb",
  "VerbosTransitivosIntransitivos.txt": "verb",
  "VerbosTransitivosIntransitivosPronominales.txt": "verb",
  "VerbosTransitivosPronominales.txt": "verb",
};

/** The general lists, and the additions for Spain's Spanish. */
const RLA_ES_FOLDERS = ["", "l10n/es_ES/"];

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

  const words: Word[] = [];
  const dropped = new Map<string, number>();
  for (const [word, percent] of prevalence) {
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

  await writeWordList(words);
  console.log(`Wrote ${words.length} Words to ${OUTPUT}`);
  console.log("Left out:", Object.fromEntries(dropped));
  for (const [name, range] of Object.entries(PREVALENCE)) {
    const count = words.filter(({ prevalence }) =>
      inRange(prevalence, range),
    ).length;
    console.log(`${name}: ${count} Words`);
  }
}

/** Every common noun, adjective and infinitive in RLA-ES, with its parts of speech. */
async function readWords(): Promise<Map<string, Set<string>>> {
  const words = new Map<string, Set<string>>();
  for (const folder of RLA_ES_FOLDERS) {
    for (const [list, partOfSpeech] of Object.entries(RLA_ES_LISTS)) {
      const file = await download(
        `${RLA_ES}${folder}${list}`,
        `rla-es-${folder.replaceAll("/", "-")}${list}`,
      );
      for (const line of (await readFile(file, "utf8")).split("\n")) {
        // "abanderado/GS": the lemma, then its Hunspell affix flags.
        const word = line.replace(/#.*/u, "").split("/")[0]?.trim() ?? "";
        // Skips the odd capitalized acronym or unit (ADSL, Celsius).
        if (!/^[a-záéíóúüñ]+$/u.test(word)) continue;
        const known = words.get(word) ?? new Set();
        words.set(word, known.add(partOfSpeech));
      }
    }
  }
  return words;
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

const entrySchema = z.object({
  word: z.string(),
  lang_code: z.string(),
  pos: z.string(),
  senses: z.optional(
    z.array(
      z.object({
        glosses: z.optional(z.array(z.string())),
        tags: z.optional(z.array(z.string())),
        raw_tags: z.optional(z.array(z.string())),
        sense_index: z.optional(z.string()),
      }),
    ),
  ),
});

/**
 * The senses of each Word in page order, from its Spanish entries under the
 * parts of speech RLA-ES gives it.
 */
async function readSenses(
  partsOfSpeech: ReadonlyMap<string, ReadonlySet<string>>,
  words: ReadonlyMap<string, unknown>,
  citations: ReadonlyMap<string, ReadonlyMap<string, string[]>>,
): Promise<Map<string, Sense[]>> {
  const file = await download(KAIKKI, "kaikki-eswiktionary.jsonl.gz");
  const lines = createInterface({
    input: createReadStream(file).pipe(createGunzip()),
  });
  const senses = new Map<string, Sense[]>();
  for await (const line of lines) {
    // Most of the 1 GB are other words and inflected forms: skip them unparsed.
    const word = /^\{"word": "([^"]*)"/u.exec(line)?.[1];
    if (word === undefined || !words.has(word)) continue;
    const entry = entrySchema.safeParse(JSON.parse(line));
    if (!entry.success) throw new Error(`Unexpected entry for ${word}`);
    const { lang_code, pos } = entry.data;
    if (lang_code !== "es") continue;
    if (!partsOfSpeech.get(word)?.has(pos)) continue;
    const cited = citations.get(word);
    const entrySenses = (entry.data.senses ?? []).map(
      ({ glosses = [], tags = [], raw_tags = [], sense_index = "" }) => ({
        gloss: glosses.join(" "),
        // Raw tags are mostly semantic fields ("Aves"): lower case, so
        // that only kaikki's own tags read as places.
        tags: [...tags, ...raw_tags.map((tag) => tag.toLowerCase())],
        sources: cited?.get(sense_index) ?? [],
      }),
    );
    senses.set(word, [...(senses.get(word) ?? []), ...entrySenses]);
  }
  return senses;
}

/** The file at `url`, downloaded to the cache unless an earlier run already did. */
async function download(url: string, name: string): Promise<string> {
  const path = `${CACHE}/${name}`;
  if (existsSync(path)) return path;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || response.body === null) {
    throw new Error(`${url}: HTTP ${response.status}`);
  }
  await pipeline(
    Readable.fromWeb(response.body),
    createWriteStream(`${path}.part`),
  );
  await rename(`${path}.part`, path);
  return path;
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
