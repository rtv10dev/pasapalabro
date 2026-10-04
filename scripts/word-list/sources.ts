/**
 * The sources the Word List is built from, downloaded to .word-list/ and
 * reused by later runs: delete the folder to fetch fresh sources.
 */
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { readFile, rename } from "node:fs/promises";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import * as z from "zod/mini";
import type { Sense } from "./senses";

export const CACHE = ".word-list";

/** Pinned to a commit (2026-09-19), so that rebuilding doesn't change the Words unnoticed. */
const RLA_ES =
  "https://raw.githubusercontent.com/sbosio/rla-es/fb279606e9ad229b9d892b0344fbb8d4ee8c47ca/ortografia/palabras/RAE/";
const KAIKKI = "https://kaikki.org/eswiktionary/raw-wiktextract-data.jsonl.gz";

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

/** Every common noun, adjective and infinitive in RLA-ES, with its parts of speech. */
export async function readWords(): Promise<Map<string, Set<string>>> {
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
  synonyms: z.optional(
    z.array(
      z.object({
        word: z.string(),
        sense_index: z.optional(z.string()),
        note: z.optional(z.string()),
      }),
    ),
  ),
});

/**
 * The senses of each Word in page order, from its Spanish entries under the
 * parts of speech RLA-ES gives it.
 */
export async function readSenses(
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
    const synonyms = entry.data.synonyms ?? [];
    const entrySenses = (entry.data.senses ?? []).map(
      ({ glosses = [], tags = [], raw_tags = [], sense_index = "" }) => ({
        gloss: glosses.join(" "),
        // Raw tags are mostly semantic fields ("Aves"): lower case, so
        // that only kaikki's own tags read as places.
        tags: [...tags, ...raw_tags.map((tag) => tag.toLowerCase())],
        sources: cited?.get(sense_index) ?? [],
        // kaikki lists an entry's synonyms together, each with its sense.
        synonyms: synonyms
          .filter(
            (synonym) =>
              sense_index !== "" && synonym.sense_index === sense_index,
          )
          .map(({ word, note = "" }) => ({ word, note })),
      }),
    );
    senses.set(word, [...(senses.get(word) ?? []), ...entrySenses]);
  }
  return senses;
}

/** The file at `url`, downloaded to the cache unless an earlier run already did. */
export async function download(url: string, name: string): Promise<string> {
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
