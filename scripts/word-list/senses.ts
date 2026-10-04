import { checkClue, type ClueProblem } from "../../src/clues/checks";
import {
  CONTAINS_LETTERS,
  MAX_OTHER_ANSWERS,
  normalize,
} from "../../src/shared/rosco";
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
  /** Synonyms Wikcionario gives for this sense. */
  synonyms: readonly Synonym[];
}

/** A synonym of a sense in Wikcionario. */
export interface Synonym {
  word: string;
  /**
   * Its usage and region note, free Spanish text or empty: "coloquial",
   * "anticuado o literario", "Argentina, Chile; malsonante"…
   */
  note: string;
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
  | "too-short"
  | "too-long"
  | "letter-name";

/** The longest Clue, in words, the Host should have to read aloud. */
const MAX_WORDS = 30;

/**
 * Words of the sense sharing this many first letters with the Word, or all of
 * a shorter Word ("uvas" for "uva"), are of its family.
 */
const FAMILY_PREFIX = 5;

/**
 * Glosses naming a letter of the alphabet, "Nombre de la letra ñ.": the
 * Rosco shows the letter, so they give the answer away. Not a Greek
 * letter's name ("Nombre de la letra λ"), which is still a Clue.
 */
const LETTER_NAME = /^nombre de la letra [a-zñ](?![\p{L}])/iu;

/**
 * Words of the sense this long or longer that the Word starts with are of
 * its family ("sana" for "sanador"); shorter ones ("sol" for "solana")
 * too often merely look like it.
 */
const SHORT_FAMILY_WORD = 4;

/**
 * Common words, normalized, that a Word may start with without being of
 * their family: "para" for "parabién", "como" for "comodín".
 */
const FUNCTION_WORDS = new Set([
  "algo",
  "cada",
  "como",
  "cual",
  "desde",
  "entre",
  "esta",
  "estas",
  "este",
  "estos",
  "hacia",
  "hasta",
  "otra",
  "otro",
  "para",
  "pero",
  "sobre",
  "toda",
  "todo",
]);

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
  if (isOffensive(sense.tags)) return "vulgar";
  if (sense.sources.some((source) => RAE_SOURCE.test(source))) {
    return "rae-source";
  }
  const length = text.split(" ").length;
  // One word is a bare synonym or variant ("Dominar."), not a definition.
  if (length === 1) return "too-short";
  if (length > MAX_WORDS) return "too-long";
  if (LETTER_NAME.test(text)) return "letter-name";
  return null;
}

/** The Clue of the Word: its first sense that passes, or null if none does. */
export function pickClue(
  word: string,
  senses: readonly Sense[],
): string | null {
  const clue = clueSense(word, senses);
  return clue === undefined ? null : clean(clue.gloss);
}

/**
 * The other answers of the Word's Clue: the first MAX_OTHER_ANSWERS synonyms
 * of its sense that are themselves in `words`, answer every letter the Word
 * answers, pass the Clue checks as its answer, and aren't labelled
 * offensive, old or rare, or for places other than Spain. Usually none.
 */
export function pickOtherAnswers(
  word: string,
  senses: readonly Sense[],
  words: ReadonlySet<string>,
): string[] {
  const clue = clueSense(word, senses);
  if (clue === undefined) return [];
  const text = clean(clue.gloss);
  const letters = lettersFor(word);
  const kept: string[] = [];
  for (const { word: other, note } of clue.synonyms) {
    if (kept.length === MAX_OTHER_ANSWERS) break;
    if (!words.has(other) || !isFitNote(note)) continue;
    const earlier = [word, ...kept];
    const passes = letters.every(
      (letter) =>
        checkClue(
          {
            letter,
            contains: CONTAINS_LETTERS.includes(letter),
            text,
            answer: other,
          },
          earlier,
        ) === null,
    );
    if (passes) kept.push(other);
  }
  return kept;
}

/** The Word's first sense that passes, which is its Clue. */
function clueSense(word: string, senses: readonly Sense[]): Sense | undefined {
  return senses.find((sense) => checkSense(word, sense) === null);
}

/**
 * Labels, or words of a free-text label, for an offensive sense: "vulgar",
 * "se usa como insulto", "de origen ofensivo"… Not "vulgarismo", a
 * nonstandard form.
 */
const OFFENSIVE = /\b(vulgar|malsonante|ofensivo|obsceno|insulto|sexista)\b/iu;

/**
 * A free-text label that makes a sense offensive only in some contexts, like
 * "en ciertos contextos se considera vulgar" for sobaco: it doesn't count.
 */
const IN_SOME_CONTEXTS = /^en ciertos contextos\b/iu;

/**
 * Labels, or words of a free-text label, for a derogatory sense. Unlike an
 * offensive one, it can be a Clue: most are mild insults the Word List keeps
 * (tonto, zoquete), and the Blocklist holds the slurs.
 */
const DEROGATORY = /\b(derogatory|despectivo|derogativo|peyorativo)\b/iu;

/**
 * Whether the sense is labelled vulgar or offensive, and used in Spain: a
 * meaning vulgar only elsewhere doesn't make the Word a Blocklist candidate.
 */
export function isOffensiveInSpain(sense: Sense): boolean {
  return isOffensive(sense.tags) && !isOutsideSpain(sense.tags);
}

/** Whether the sense is labelled derogatory (despectivo). */
export function isDerogatory(sense: Sense): boolean {
  return sense.tags.some((tag) => DEROGATORY.test(tag));
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

/**
 * Whether the text holds a word of the Word's family: one built on the same
 * stem, like "articula" for "articulador", even when the stem changes
 * ("enmienda" for "enmendador"), or a short word the Word is built on, like
 * "sana" for "sanador".
 */
function hasFamilyWord(text: string, word: string): boolean {
  const normalized = normalize(word);
  const stem = undoStemChange(normalized).slice(0, FAMILY_PREFIX);
  return normalize(text)
    .split(/[^a-zñ]+/u)
    .some(
      (each) =>
        undoStemChange(each).startsWith(stem) ||
        (each.length >= SHORT_FAMILY_WORD &&
          !FUNCTION_WORDS.has(each) &&
          normalized.startsWith(each)),
    );
}

/** The word with "ie" and "ue" back to the "e" and "o" they come from in a changing stem. */
function undoStemChange(word: string): string {
  return word.replaceAll("ie", "e").replaceAll("ue", "o");
}

/** Words of a synonym's note for an old or rare use: "hoy desusado", "anticuado o literario". */
const OLD_OR_RARE_NOTE =
  /\b(anticuad[oa]|antigu[oa]|arcaic[oa]|desusad[oa]|desuso|obsolet[oa]|poco (usad[oa]|frecuente)|menos usad[oa]|sin uso)\b/iu;

/** Lower-case words of a synonym's note for places outside Spain. */
const OUTSIDE_SPAIN_NOTE =
  /\b(rioplatense|andin[oa]|lunfard[oa]|lunfardismo|\p{L}*americanos?|\p{L}*americanas?)\b/iu;

/**
 * Whether a synonym with this note can be an other answer: not offensive,
 * nor old or rare, and used across Spain, as a Clue's sense must be. A note
 * naming Spain is fine wherever else it names; otherwise any capitalized
 * word is taken for a place, in Spain or out of it.
 */
function isFitNote(note: string): boolean {
  if (isOffensive([note]) || OLD_OR_RARE_NOTE.test(note)) return false;
  if (/\bEspaña\b/u.test(note)) return true;
  return !/\p{Lu}/u.test(note) && !OUTSIDE_SPAIN_NOTE.test(note);
}

/** Whether the sense is labelled vulgar or offensive, anywhere. */
function isOffensive(tags: readonly string[]): boolean {
  return tags.some((tag) => OFFENSIVE.test(tag) && !IN_SOME_CONTEXTS.test(tag));
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
