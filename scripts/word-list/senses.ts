import { checkClue, type ClueProblem } from "../../src/clues/checks";
import { CONTAINS_LETTERS, normalize } from "../../src/shared/rosco";
import { lettersFor } from "../../src/shared/word-list";

/** One sense of a Word in Wikcionario, as the build reads it. */
export interface Sense {
  gloss: string;
  /**
   * Its usage, region and form labels: "outdated", "Chile", "vulgar",
   * "form-of"… Places are capitalized, every other label is lower case.
   */
  tags: readonly string[];
  /** The templates of the dictionaries its references cite: "DRAE2001", "DLE1925"… */
  sources: readonly string[];
}

/** Why a sense can't be a Word's Clue (ADR 0005). */
export type SenseProblem =
  | ClueProblem
  | "family"
  | "cross-reference"
  | "old-or-rare"
  | "not-spain"
  | "regional"
  | "vulgar"
  | "rae-source"
  | "too-long";

/** The longest Clue, in words, the Host should have to read aloud. */
const MAX_WORDS = 30;

/**
 * Words of the sense sharing this many first letters with the Word, or all of
 * a shorter Word ("uvas" for "uva"), are of its family.
 */
const FAMILY_PREFIX = 5;

/** Glosses that only point to another entry or form, maybe after a scientific name. */
const CROSS_REFERENCE =
  /^(\([^)]*\) )?(véase|ver|forma (del|pronominal|flexiva|acortada|abreviada)|variante|grafía|(sinónimo|antónimo|diminutivo|aumentativo|superlativo|despectivo|femenino|masculino|plural|apócope|acortamiento|abreviatura|gerundio|participio|infinitivo) de)\s/iu;

/**
 * Glosses that lean on a neighbouring sense: "Por extensión del anterior",
 * "Madera de este árbol", "Relativo a ese pueblo", "Producido por dicho toque".
 * Not "al este de Madrid", nor "Dicho de una persona".
 */
const PREVIOUS_SENSE =
  /\b(del|al|lo|los|las) anteriore?s?\b(?! (a|al|de|del)\b)|\b(acepción|sentido|significado|fruto|definición) anterior\b|\b(de|a|con|en|por) (este|esta|estos|estas|ese|esa|esos|esas|dicho|dicha|dichos|dichas) (?!(de|del)\b)\p{L}/iu;

const OLD_OR_RARE = new Set([
  "outdated",
  "obsolete",
  "archaic",
  "rare",
  "desuso",
  "en desuso",
  "sin uso",
]);

const VULGAR = new Set(["vulgar", "malsonante", "ofensivo", "obsceno"]);

/** Labels for all of Spain, not a region of it. */
const COUNTRY_WIDE = new Set(["Spain", "Europe"]);

/** Lower-case labels for the Spanish of places outside Spain. */
const OUTSIDE_SPAIN = new Set(["lunfardismo"]);

/**
 * Spain and its regions. Any other capitalized tag is a place outside Spain;
 * usage labels are lower case.
 */
const SPAIN = new Set([
  "Spain",
  "Europe",
  "Andalusia",
  "Aragon",
  "Asturias",
  "Balearic-Islands",
  "Basque Country",
  "Burgos",
  "Canaries",
  "Cantabria",
  "Castile",
  "Catalonia",
  "Ceuta",
  "Cádiz",
  "Extremadura",
  "Galicia",
  "Grenada",
  "Huelva",
  "La Rioja",
  "León",
  "Murcia",
  "Navarra",
  "Palencia",
  "Ribera-Navarra",
  "Rioja",
  "Salamanca",
  "Seville",
  "Soria",
  "Valencia",
  "Vizcaya",
  "Zamora",
  "Álava",
  "Almería",
]);

/**
 * Dictionaries of the RAE and ASALE still under copyright: their text must
 * not be copied (ADR 0005). Editions up to 1936 are in the public domain.
 */
const RAE_SOURCE = /^(DRAE.*|DLE|Damer|DPD|DEJ|DHLE)$/;

/** Why the sense can't be the Clue of the Word, or null if it can. */
export function checkSense(word: string, sense: Sense): SenseProblem | null {
  const text = clean(sense.gloss);
  const letter = lettersFor(word)[0];
  if (letter === undefined) return "letter-rule";
  const problem = checkClue(
    { letter, contains: CONTAINS_LETTERS.includes(letter), text, answer: word },
    [],
  );
  if (problem !== null) return problem;
  if (
    CROSS_REFERENCE.test(text) ||
    PREVIOUS_SENSE.test(text) ||
    sense.tags.includes("form-of")
  ) {
    return "cross-reference";
  }
  if (hasFamilyWord(text, word)) return "family";
  if (sense.tags.some((tag) => OLD_OR_RARE.has(tag.toLowerCase()))) {
    return "old-or-rare";
  }
  if (isOutsideSpain(sense.tags)) return "not-spain";
  if (isRegional(sense.tags)) return "regional";
  if (sense.tags.some((tag) => VULGAR.has(tag.toLowerCase()))) return "vulgar";
  if (sense.sources.some((source) => RAE_SOURCE.test(source))) {
    return "rae-source";
  }
  if (text.split(" ").length > MAX_WORDS) return "too-long";
  return null;
}

/** The Clue of the Word: its first sense that passes, or null if none does. */
export function pickClue(
  word: string,
  senses: readonly Sense[],
): string | null {
  const first = senses.find((sense) => checkSense(word, sense) === null);
  return first === undefined ? null : clean(first.gloss);
}

/**
 * The gloss without what wiktextract leaves of the wiki: sense-number
 * subscripts ("Anublar₁"), editors' notes ("^([cita requerida])"), trailing
 * synonym or usage lines (" :*Sinónimo: miedo"), brackets around a complement
 * ("[algo o a alguien]") and doubled full stops.
 */
function clean(gloss: string): string {
  return gloss
    .replace(/[₀-₉]/gu, "")
    .replace(/\s*\^\(\[[^\]]*\]\)/gu, "")
    .replace(/\s*:\*.*$/u, "")
    .replace(/\[([^\]]*)\]/gu, "$1")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\.{2,}$/u, ".");
}

/** Whether the text holds a word built on the same stem, like "articula" for "articulador". */
function hasFamilyWord(text: string, word: string): boolean {
  const stem = normalize(word).slice(0, FAMILY_PREFIX);
  return normalize(text)
    .split(/[^a-zñ]+/u)
    .some((each) => each.startsWith(stem));
}

/** Whether the sense is labelled for regions of Spain, not for all of it. */
function isRegional(tags: readonly string[]): boolean {
  const places = tags.filter(isPlace);
  return places.length > 0 && !places.some((place) => COUNTRY_WIDE.has(place));
}

function isPlace(tag: string): boolean {
  return /^\p{Lu}/u.test(tag);
}

/** Whether the sense is labelled for places, none of them in Spain. */
function isOutsideSpain(tags: readonly string[]): boolean {
  if (tags.some((tag) => OUTSIDE_SPAIN.has(tag))) return true;
  const places = tags.filter(isPlace);
  return places.length > 0 && !places.some((place) => SPAIN.has(place));
}
