# Clues from open dictionary definitions: research notes

Question: Answers will come from code, drawn from the open answer pool (RLA-ES nouns, adjectives and infinitives joined with SPALEX Spain prevalence; see `word-list-difficulty.md`). As on the TV show, the Clue should be the dictionary definition of the answer, with as little AI as possible. Where can we get Spanish definitions for those words legally, for an app that may become public and commercial, and how usable are they as Clues without changes?

All sources were accessed on **2026-10-04** unless a date says otherwise. "Wayback" means an Internet Archive capture of the first-party URL. "Checked here" means I downloaded the data and counted or joined it myself in a scratch folder outside the repo. Nothing was added to the repo except this note.

**The pool, rebuilt here:** 34,226 lemmas, the same set as the previous note: the RLA-ES list joined with SPALEX. Unlike the previous note, this one scores every word by SPALEX `percent_nts`, the share of native speakers from Spain who know it. It uses four bands:

| Band (`percent_nts`) | Words |
|---|---|
| ≥ 95 % | 15,673 |
| 80–95 % | 5,800 |
| 50–80 % | 5,751 |
| < 50 % | 7,002 |

POS comes from the RLA-ES file each lemma sits in:

| POS | Words |
|---|---|
| Noun only | 17,856 |
| Adjective only | 7,782 |
| Verb only | 5,442 |
| Adjective and noun | 3,033 |
| Other mixes | 113 |

## Short answer

**Spanish Wiktionary (Wikcionario) is the only large open source with real Spanish definitions. It gives a usable Clue for about 57 % of the pool, and that share falls as words get harder.**

- **Licence: CC BY-SA 4.0 (or GFDL), so commercial use is allowed.** Attribution can be a link to each entry. Share-alike applies to the Clue text we ship, not to the app's code: if we publish or show a set of Clues built from Wikcionario, that set must also be CC BY-SA 4.0 (§1).
- **Getting the data is easy.** kaikki.org publishes a pre-parsed JSONL of the **Spanish edition**, with Spanish glosses, extracted on 2026-10-02 from the 2026-10-01 dump: 98 MB gzipped (§1).
- **Coverage (checked here): 25,378 of 34,226 pool words (74.1 %) have at least one Spanish definition.** By band:

  | Band | Covered |
  |---|---|
  | ≥ 95 % | 89.0 % |
  | 80–95 % | 73.1 % |
  | 50–80 % | 60.8 % |
  | < 50 % | 52.7 % |

  The main gap is that 6,755 pool words have no Wikcionario entry at all (§1).
- **Usable as-is: about two thirds of first definitions.** First definitions have a median length of 10 words, and 63 % have 12 words or fewer.
  - **27 % give away the answer's family.** They contain a word sharing the first 5 letters with the answer, as in *articulador*: "Que articula." Only 2.8 % contain the answer itself, which is the only case `checkClue` catches.
  - **4.2 % are "Acción y/o efecto de X"**, and 13.8 % start "Que …".
  - **Few are tagged:** 2 % old or rare, and 1.2 % regional outside Spain.

  A simple filter (no old/rare or non-Spain tag, no family word, no cross-reference, 30 words or fewer) passes **63.5 % of first definitions**. **76.7 % of covered words have at least one sense that passes** (§2).
- **Old RAE editions are in the public domain in Spain up to the 16th edition (1936/1939),** by my reading of the LPI's transitional provision 2 (80 years from publication for legal persons under the 1879 law). The 1925 edition is on archive.org with usable OCR text. About 86 % of pool words appear in it as headwords (rough count). But its definitions are often dated, as in *nevera*: "La que vende nieve." or *ordenador*: "Que ordena.", and the OCR needs parsing and cleaning (§3).
- **The other open sources are thin.** Spanish WordNet glosses (MCR / Open Multilingual Wordnet, CC BY 3.0) cover 21 % of the pool. Wikidata Lexemes (CC0) cover 16 % (§4).
- **Dropping words that have no usable definition would cost 43 % of the pool:**

  | Band | Share dropped |
  |---|---|
  | ≥ 95 % | 27 % |
  | 80–95 % | 48 % |
  | 50–80 % | 58 % |
  | < 50 % | 62 % |

  Even so, the kept pool still has **19,470 words**, 2,653 of them in the < 50 % band (§5).

**Main risks:**

1. **Provenance inside Wikcionario.** 6.8 % of first definitions cite the 2001 or 2014 DRAE, or the Diccionario de americanismos, as their source. Wikcionario forbids literal copying from them, and editors have blanked such definitions before (1,070 pool words have only blanked senses). Uncited definitions could still be close paraphrases of the RAE, which I can't measure.
2. **Share-alike** makes the Clue dataset itself CC BY-SA, so it can't be kept proprietary.
3. **The filters check form, not truth or fairness.** The first sense is not always the one people in Spain know (*hule*, *caliche*). Some definitions are too vague (*cachucho*: "Embarcación pequeña.") or too long. The Host stays the last line of defence, as ADR 0004 says.
4. **The legal readings** (term of the old DRAE editions, US status, what counts as Adapted Material) are mine, not a lawyer's.

---

## 1. Spanish Wiktionary (Wikcionario)

### Licence

- **Footer of every page** (for example `https://es.wiktionary.org/wiki/abollar`): "El texto está disponible bajo la Licencia Creative Commons Atribución-CompartirIgual 4.0. Pueden existir condiciones adicionales."
- **Wikimedia Terms of Use** (`https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use`), on text contributors hold the copyright to: "you agree to license it under: Creative Commons Attribution-ShareAlike 4.0 International License ("CC BY-SA 4.0"), and GNU Free Documentation License ("GFDL") … Reusers may comply with either license or both." CC BY-SA is the practical choice, because GFDL would require shipping the licence text.
- **Attribution under the Terms of Use, "Re-use":** "you agree to attribute the authors in any of the following fashions: Through hyperlink (where possible) or URL to the page or pages that you are reusing (since each page has a history page that lists all contributors…)", or a link to a stable copy that credits them, or a list of all authors. Text imported from external sources may carry extra attribution requirements.
- **CC BY-SA 4.0 legal code** (`https://creativecommons.org/licenses/by-sa/4.0/legalcode.en`):
  - §3(a) Attribution: we must keep the creator credit and a link to the material "to the extent reasonably practicable", and "indicate if You modified the Licensed Material". This can be done "by providing a URI or hyperlink to a resource that includes the required information".
  - §3(b) ShareAlike: "if You Share Adapted Material You produce … The Adapter's License You apply must be a Creative Commons license with the same License Elements, this version or later", and we may not add terms or DRM that restrict it.
  - "Share" includes "public display" and making material available on demand, so showing a Clue in the app counts.
  - "Adapted Material" is material "translated, altered, arranged, transformed, or otherwise modified".
  - §4: if we include "all or a substantial portion of the database contents" in our own database, our database (not its other contents) is Adapted Material.
  - Commercial use is allowed: the grant in §2 has no non-commercial term.

**What this means for us (my reading, not legal advice):**

- **Attribution.** An "Definiciones: Wikcionario, CC BY-SA 4.0" credit, with a link to each word's entry, should satisfy attribution. The Results screen, which already lists every Clue with its answer, is a natural place for the per-word link.
- **Modifications.** Trimming or rewording a definition is a modification that must be flagged.
- **Share-alike.** The Clue table built from Wikcionario is Adapted Material, so if it is shared it must be CC BY-SA 4.0. The app's code merely displays the text and is not Adapted Material; CC BY-SA is not a software copyleft.
- **Copyleft in the answer pool.** The RLA-ES-derived pool already carries GPL/LGPL/MPL (previous note, §3).

### How to get it

| Source | What | Licence | Checked here |
|---|---|---|---|
| Wikimedia dump `https://dumps.wikimedia.org/eswiktionary/latest/eswiktionary-latest-pages-articles.xml.bz2` | wikitext, 89,154,320 bytes, dated 01-Oct-2026 | CC BY-SA 4.0 / GFDL | downloaded. 27,471 pool words have a page with a `{{lengua\|es}}` section |
| **kaikki.org, Spanish edition** `https://kaikki.org/eswiktionary/rawdata.html` → `raw-wiktextract-data.jsonl.gz` | "extracted from the eswiktionary dump dated 2026-10-01 … has glosses and other metadata in Spanish". 98.4 MB gzipped, 1.1 GB raw. **855,637 Spanish-language (`lang_code: es`) entries**, most of them inflected forms (`form_of`) | Data: "the same licenses as Wiktionary - both CC-BY-SA and GFDL" (`https://kaikki.org/eswiktionary/`). Tool: wiktextract is MIT ("free for both commercial and non-commercial use", README at `https://github.com/tatuylonen/wiktextract`). Academic users are asked to cite Ylonen, LREC 2022 | downloaded and parsed |
| kaikki.org, English edition (`https://kaikki.org/dictionary/rawdata.html`) | Spanish words with **English** glosses | same | not useful for Clues |

The Spanish-edition JSONL gives the following for each sense:

- `glosses`;
- `tags`: `outdated` (Desusado / "Términos anticuados"), `obsolete`, `rare`, `colloquial`, `vulgar`, and region tags such as `Chile`, `Spain` or `Andalusia`;
- `raw_tags` and `topics` (semantic field);
- `sense_index`;
- `form_of`, which marks inflections.

It does **not** keep the `<ref>` source citations, so §2 recovers them from the wikitext dump.

### Coverage of the pool (checked here)

**"Covered"** means all of the following:

- an entry with `lang_code` "es" exists for exactly that headword;
- it sits under a part of speech the pool gives the word (noun, adjective or verb, excluding Wikcionario's "Forma …" sections);
- it has at least one sense with a non-empty gloss that is not an inflection pointer.

| Band (`percent_nts`) | Pool | Covered | % |
|---|---|---|---|
| ≥ 95 | 15,673 | 13,949 | 89.0 |
| 80–95 | 5,800 | 4,240 | 73.1 |
| 50–80 | 5,751 | 3,497 | 60.8 |
| < 50 | 7,002 | 3,692 | 52.7 |
| **All** | **34,226** | **25,378** | **74.1** |

| POS (word counted under each POS the pool gives it) | Pool | Covered | % |
|---|---|---|---|
| Noun | 20,967 | 15,966 | 76.1 |
| Adjective | 10,868 | 7,511 | 69.1 |
| Verb (infinitive) | 5,555 | 4,464 | 80.4 |

Why the other 8,848 have no definition, by band (≥ 95 / 80–95 / 50–80 / < 50):

| Reason | Words | By band | Examples |
|---|---|---|---|
| No Spanish entry | 6,755 | 845 / 1,189 / 1,812 / 2,909 | *megáfono*, *juguetón*, *tragicomedia*, *testicular* |
| Entry exists but every definition is blank | 1,070 | 338 / 191 / 282 / 259 | *graduar*, *visualizar*, *subastar* |
| Only inflected-form entries | 743 | 416 / 130 / 118 / 79 | *clienta*: "Forma del femenino singular de cliente.", *discreta*, *pegada* |
| Entry only under another POS | 280 | 125 / 50 / 42 / 63 | |

**The blank entries are copyright clean-up.** For example, the raw wikitext of `https://es.wiktionary.org/w/index.php?title=graduar&action=raw` is `;1: <ref name="drae">{{DRAE2001}}</ref>` repeated for seven senses, with no definition text. The DRAE-copied definitions were removed and the sense skeleton was left behind.

The inflected-form entries are mostly feminine forms that RLA-ES lists as nouns of their own. That is a pool question (should *clienta* be an answer?) as much as a coverage one.

## 2. How usable the definitions are as Clues (checked here)

The "first definition" is the first non-empty, non-inflection sense of the first matching entry, in page order. All percentages are of covered words.

**How the family check works.** It approximates "contains the headword or an obvious family word" in two steps:

1. **Exact:** the same test as `checkClue`'s `givesAway` in `src/clues/checks.ts`. The text is normalised as `normalize` does it (lower case, accents removed, ñ kept). For answers of 4 or more letters, the check fails if any word of the text starts with the answer. For shorter answers, only an exact word match fails.
2. **Family:** any word of 5 or more letters in the gloss shares its first 5 letters with a headword of 5 or more letters.

In a sample of 25 family hits, most were true family words (*espetar*/*espetón*, *oligarca*/*oligarquía*, *parasitismo*/*parásito*). False positives exist, such as *empréstito*/*empresa*, so read the family figures as slightly high.

| Measure (first definition) | All covered | ≥ 95 | 80–95 | 50–80 | < 50 |
|---|---|---|---|---|---|
| Words | 25,378 | 13,949 | 4,240 | 3,497 | 3,692 |
| Length in words: p10 / median / p90 | 3 / 10 / 26 | 4 / 10 / 25 | 3 / 9 / 25 | 3 / 9 / 27 | 3 / 10 / 33 |
| 12 words or fewer (TV-like) | 63.4 % | 64.0 % | 65.2 % | 64.7 % | 58.0 % |
| More than 20 words | 16.3 % | 15.0 % | 15.3 % | 17.0 % | 21.3 % |
| 2 words or fewer (synonym only, e.g. *estío*: "Verano.") | 6.2 % | 5.0 % | 8.0 % | 7.8 % | 7.3 % |
| **Contains the answer** (`checkClue` would reject) | 2.8 % | 2.9 % | 2.9 % | 2.5 % | 3.0 % |
| **Contains a family word** (includes the row above) | 27.3 % | 28.2 % | 32.7 % | 28.7 % | 16.5 % |
| "Acción y efecto de" / "Acción o efecto de" | 4.2 % | 5.4 % | 4.3 % | 2.6 % | 1.2 % |
| "Acción / Efecto / Acto / Resultado de" (without y/o) | 0.6 % | 0.8 % | 0.5 % | 0.5 % | 0.2 % |
| "Cualidad / Calidad / Condición / Estado de" | 0.7 % | 0.8 % | 0.9 % | 0.7 % | 0.3 % |
| Starts "Que …" | 13.8 % | 14.6 % | 17.1 % | 13.0 % | 8.0 % |
| "Perteneciente / Relativo / Propio / Relacionado …" | 2.4 % | 2.6 % | 2.5 % | 2.5 % | 1.8 % |
| A formula above **plus** a family word (e.g. *desmenuzador*: "Que desmenuza.", *inclusión*: "Acción o efecto de incluir.") | 13.5 % | 15.2 % | 16.9 % | 11.5 % | 4.8 % |
| Cross-reference ("Variante de", "Véase", "Forma …", "Sinónimo de", "Diminutivo de" …) | 1.8 % | 0.8 % | 2.0 % | 3.4 % | 3.8 % |
| Tagged old or rare (`outdated`, `obsolete`, `rare`) | 2.0 % | 1.1 % | 1.9 % | 2.8 % | 4.6 % |
| Tagged regional outside Spain (and not also `Spain`) | 1.2 % | 0.5 % | 1.1 % | 1.8 % | 3.1 % |
| Tagged vulgar, derogatory or slang | 0.7 % | 0.6 % | 0.9 % | 0.8 % | 0.6 % |
| Word has only one sense | 38.7 % | 28.7 % | 45.1 % | 50.2 % | 58.5 % |
| **First definition passes the filter** (below) | **63.5 %** | 65.4 % | 59.1 % | 59.7 % | 64.8 % |
| **At least one sense passes the filter** | **76.7 %** | 81.5 % | 71.3 % | 69.2 % | 71.9 % |

**The filter** keeps a sense if all of these hold:

- it has no old/rare tag;
- it has no non-Spain region tag;
- it contains no family word;
- it is not a cross-reference;
- it is 30 words or fewer.

It says nothing about whether the sense is the one players know, or specific enough to pin the answer.

**Where the first definitions come from.** I matched each sense's `sense_index` to its `;N:` line in the wikitext dump and read its `<ref>`:

| Source cited | Share of first definitions |
|---|---|
| No source | 70.3 % |
| A pre-1950 dictionary: DLE 1925, DLC 1914, Labernia 1866, DLC 1884/1899, Salvá 1847 … | 21.3 % |
| A modern RAE/ASALE work: DRAE 2001, DLE 2014, Diccionario de americanismos 2010 … | **6.8 %** |
| Other | 1.6 % |

Across all definition lines of the pool's pages, the most cited sources are:

| Source | Lines citing it |
|---|---|
| DLE1925 | 5,347 |
| DRAE2001 | 5,173 |
| DLC1914 | 3,752 |
| Labernia1866 | 2,190 |
| DLE (2014) | 1,320 |
| Damer | 512 |

Wikcionario's own rule, from `https://es.wiktionary.org/wiki/Wikcionario:Referencias`: "es ILEGAL copiar literalmente definiciones de diccionarios con derechos reservados, tales como el *Diccionario de la lengua española* de la RAE". When a copy is found, editors are to delete it or reword it. So a citation of the modern DRAE should mean the definition was consulted and reworded, not copied, but nothing guarantees it.

**Other things worth knowing:**

- 2,027 first definitions (8 %) contain a parenthetical gloss, such as *delirio*: "Acción o efecto de delirar (tener trastornada la razón)."
- 106 contain sense-number subscripts, such as *añublar*: "Anublar₁."
- 1,659 don't end in a full stop.

These are cheap to clean up mechanically.

**Fifteen random examples** (seed fixed, 4/4/4/3 across the bands). "Filter" is the automatic filter above; "Fair Clue?" is my judgement.

| Band | Word (`percent_nts`) | First definition | Filter | Fair Clue? |
|---|---|---|---|---|
| ≥ 95 | circular (99.6) | Que tiene forma de círculo o que pertenece al círculo. | drop (family: *circu-*) | Yes for Fácil, though it hints heavily |
| ≥ 95 | anfiteatro (98.2) | Tipo de edificio público de la civilización romana, utilizado para acoger espectáculos y juegos | pass | Yes |
| ≥ 95 | solana (98.0) | El sitio donde el sol calienta más. | pass (cites Labernia 1866) | Yes |
| ≥ 95 | embellecedor (100) | Moldura cromada de los automóviles. | pass | Yes, a narrow sense but true |
| 80–95 | porfiar (83.5) | Disputar y altercar obstinadamente y con tenacidad. | pass (cites DLE 1925) | Yes, with old-fashioned wording |
| 80–95 | hule (80.9) | Polímero natural elaborado a partir de la savia de plantas específicas, como por ejemplo la Castilla elastica, es una sustancia muy elástica… | pass | **No.** About 30 words, and it gives the American sense (rubber); in Spain *hule* is mainly oilcloth |
| 80–95 | efluvio (80.5) | Emanación sutil de partículas que producen un ligero olor. | pass | Yes |
| 80–95 | circunloquio (85.2) | Artificio de palabras para dar a entender algo que hubiera podido explicarse más brevemente o con palabras más comunes. | pass (cites DLC 1914) | Yes, though long |
| 50–80 | intrincar (79.4) | Enredar o enmarañar una cosa. | pass (**cites DRAE 2001**) | Yes as text; provenance flag |
| 50–80 | boardilla (50.6) | Ventana que sobresale verticalmente en el tejado de una casa… | pass | The definition is fine, but the answer is a variant spelling of *buhardilla*, so this is a pool issue |
| 50–80 | flete (60.5) | Precio del alquiler de un buque o de parte de este. | pass | Yes |
| 50–80 | osco (70.5) | Que pertenece o concierne al antiguo pueblo itálico que habitó la actual región italiana de la Campania en el primer milenio antes de Cristo. | pass | Borderline: true but long |
| < 50 | empréstito (38.8) | Préstamo que se hace al Estado, a una corporación o a una empresa, especialmente cuando está respaldado por títulos… | drop (false positive: *empresa*) | Yes |
| < 50 | cachucho (27.8) | Embarcación pequeña. | pass | **No**, too vague to pin the answer |
| < 50 | caliche (30.0) | Costra de arena y sales minerales, que aflora en el desierto de Atacama… | drop (tagged Bolivia, Chile, Peru) | **No** for players in Spain |

My judgement on these 15:

| Verdict | Count |
|---|---|
| Fair as written | 10 |
| Borderline | 2 |
| Not fair | 3 |

The automatic filter agreed on 12 of the 15. **The TV show's Clues are one short sentence.** Here the median is 10 words, but a sixth of the definitions run past 20 words, and they would need trimming. Trimming is a modification, which we would have to indicate under the licence.

## 3. Public-domain editions of the RAE dictionary

### The law

These quotes are from the consolidated Ley de Propiedad Intelectual, Real Decreto Legislativo 1/1996 (`https://www.boe.es/buscar/act.php?id=BOE-A-1996-8930`):

- **Art. 8, obra colectiva:** one "creada por la iniciativa y bajo la coordinación de una persona natural o jurídica que la edita y divulga bajo su nombre … Salvo pacto en contrario, los derechos sobre la obra colectiva corresponderán a la persona que la edite y divulgue bajo su nombre." The DRAE, written by the Academy and published under its name, fits this.
- **Art. 28.2:** "Los derechos de explotación sobre las obras colectivas definidas en el artículo 8 de esta Ley durarán setenta años desde la divulgación lícita de la obra protegida." If the natural persons who wrote the work are named as authors in published versions, articles 26 or 28.1 apply instead.
- **Art. 30:** the terms "se computarán desde el día 1 de enero del año siguiente al de … la divulgación lícita de la obra".
- **Transitional provision 2 (Disposición transitoria segunda):** "Las personas jurídicas que en virtud de la Ley de 10 de enero de 1879 sobre Propiedad Intelectual hayan adquirido a título originario la propiedad intelectual de una obra, ejercerán los derechos de explotación por el plazo de ochenta años desde su publicación."
- **Transitional provision 4** keeps the 1879 terms for works by authors who died before 7 December 1987.

**Reading (mine, not legal advice).** Editions the RAE published before the 1987 law were acquired by a legal person under the 1879 law, so transitional provision 2 gives them **80 years from publication**, counted from the following 1 January:

- Every edition published up to 1945 entered the public domain in Spain by 1 January 2026. That covers **the 1st (1780) to the 15th (1925) and the 16th (1936, distributed 1939)**.
- **The 17th (1947) enters on 1 January 2028.** The 18th (1956) enters in 2037. Under art. 28.2's 70 years alone it would be 2027.

A 2011 Wikcionario discussion (quoted in `https://es.wiktionary.org/w/index.php?title=Wikcionario:Caf%C3%A9/2012_01&action=raw`) used the 70-year rule and reached "toda edición del DRAE previa a 1941". Wikcionario templates exist for the 1780, 1817, 1884, 1899, 1914, 1925 and 1936 editions. *I didn't verify the edition years beyond 1914 and 1925 against primary bibliographic records. I didn't check US status either: works published before 1931 should be public domain there, but the 1936/1939 edition may still be protected in the US. That matters only if US law applies to us.*

### Machine-readable text

| Where | What | Status (checked here) |
|---|---|---|
| archive.org `diccionariodelal00realuoft` (`https://archive.org/details/diccionariodelal00realuoft`) | **1914, 14th edition**, University of Toronto scan. Metadata `possible-copyright-status: NOT_IN_COPYRIGHT`. `_djvu.txt` (12.7 MB), hOCR, EPUB | Downloaded. **OCR is poor**: "Bucle. (Dti ui. hiecüU.) m. Rizo de cabe- llo en forma cilindrica." |
| archive.org `diccionariodelal0000unse_b3a3` (`https://archive.org/details/diccionariodelal0000unse_b3a3`) | **1925, 15th edition** (the one `{{DLE1925}}` on Wikcionario links to). Tesseract 5.3 OCR, `_djvu.txt` 12.8 MB | Downloaded. **OCR is decent**, with hyphenation, two-column breaks and slips such as "[13." for "‖3.". It needs an entry parser |
| es.wikisource.org | Only the front matter and letter "A" stub of *Diccionario de autoridades* Tomo I (17 pages, `https://es.wikisource.org/wiki/Diccionario_de_autoridades`); no DRAE edition found | API search |
| Project Gutenberg | No Spanish monolingual dictionary: a gutendex search for "diccionario" returns 4 bilingual ones | API search |
| HathiTrust | Catalogue returns a Cloudflare challenge (403) | **not verified** |
| NTLLE (RAE, *Nuevo tesoro lexicográfico*) | `ntlle.rae.es` and `apps2.rae.es/ntlle/` return 403 behind Cloudflare; Wayback holds only challenge pages | **not verified**: terms, and whether it offers text or only facsimile images |

**Coverage (rough, checked here):** I counted pool words that appear as an upper-case headword at the start of a line in the 1925 OCR (`^WORD[.,;:]`). **29,340 of 34,226 (85.7 %)** do:

| Band | Found as headword |
|---|---|
| ≥ 95 % | 87.2 % |
| 80–95 % | 82.7 % |
| 50–80 % | 85.0 % |
| < 50 % | 85.5 % |

Words coined later are missing, such as *contraseña*, *maquillaje*, *largometraje* and *telefonazo*. OCR errors make this a lower bound, but I didn't parse or check the definitions themselves.

**How dated the language is.** Some 1925 first senses, from the OCR, lightly cleaned:

| Word | First sense (1925) |
|---|---|
| alboroto | "Vocerío o estrépito causado por una o varias personas." |
| cabestrillo | "Banda o aparato pendiente del hombro para sostener la mano o el brazo lastimados." |
| zancajo | "Hueso del pie, que forma el talón." |
| nevera | "La que vende nieve." |
| cafetera | "Dueña de un café." |
| ordenador | "Que ordena." |
| automóvil | "adj. Que se mueve por sí mismo." |
| mechero | "Cañutillo o canalita en donde se pone la mecha…" (the lighter is sense 4) |
| teléfono | "Conjunto de aparatos e hilos conductores con los cuales se transmite a distancia la palabra…" |
| jirafa | "Mamífero rumiante, indígena del África, de cinco metros de altura…" |
| xilófono | absent |

- **Fine as Clues:** *alboroto*, *cabestrillo*, *zancajo*.
- **Misleading today:** *nevera*, *cafetera*, *ordenador*, *automóvil* and *mechero* lead with a sense nobody knows now.
- **Dated and long:** *teléfono*, *jirafa*.

Entries also use dense abbreviations ("Ú. t. c. r.", "fig. y fam.") and cross-references ("Bollón, 4.ª acep."). Wikcionario has already imported many of these old definitions, with the citations counted in §2, which is the cheapest way to benefit from them.

## 4. Other open sources

| Source | Licence | Spanish definitions? | Pool coverage (checked here) |
|---|---|---|---|
| **MCR 3.0** (Multilingual Central Repository, Spanish WordNet) | "All other data in this package [except engWN/] are distributed under Attribution 3.0 Unported (CC BY 3.0)" (`https://adimen.si.ehu.es/web/MCR`, Wayback 2024). The site didn't connect today, and the Wayback tarball was truncated, so I counted the NLTK conversion at `https://github.com/pln-fing-udelar/wn-mcr-transform` (`wordnet_spa.tar.gz`) | 17,773 of 115,091 noun/verb/adjective synsets have a Spanish gloss; the rest are `NULL`. The glosses read like translations of Princeton WordNet's: *besar*: "tocar suave o dulcemente", *zalamería*: "elogio hipócrita o excesivo" | **7,286 (21.3 %)**: ≥ 95 36.4 %, 80–95 14.8 %, 50–80 7.9 %, < 50 3.9 % |
| **Open Multilingual Wordnet** (`https://github.com/omwn/omw-data/tree/main/wns/mcr`) | CC BY 3.0 (header of `wn-data-spa.tab`) | Same MCR data: 145,641 `spa:lemma` rows, 19,444 `spa:def` | not counted separately (same source) |
| **Wikidata Lexemes** | **CC0** for the Lexeme namespace (`https://www.wikidata.org/wiki/Wikidata:Licensing`) | 14,514 Spanish lemmas with at least one Spanish sense gloss (SPARQL on `https://query.wikidata.org/`). Formulaic style: *óptico*: "propio de o relacionado con la visión" | **5,417 (15.8 %)**: 20.7 / 16.7 / 12.4 / 7.0 % |
| English Wiktionary (kaikki) | CC BY-SA / GFDL | No, the glosses are in English | — |
| RLA-ES `sinonimos/` (same repo as the pool) | GPL / LGPL / MPL | Synonyms, not definitions | not measured |

Both are much weaker than Wikcionario and skew to easy words. Of the 14,756 words §5 would drop, 3,831 have an MCR or Wikidata gloss (1,988 / 831 / 626 / 386 by band, before any quality filter). So they could add some coverage at the easy end, at the cost of a second attribution (MCR) and a duller style.

## 5. Words without a usable definition

A word counts as usable if at least one Wikcionario sense passes the §2 filter.

| Band | Pool | No definition at all | Definition, none passes | **Usable** | Lost if dropped |
|---|---|---|---|---|---|
| ≥ 95 | 15,673 | 1,724 | 2,574 | **11,375** | 4,298 (27.4 %) |
| 80–95 | 5,800 | 1,560 | 1,217 | **3,023** | 2,777 (47.9 %) |
| 50–80 | 5,751 | 2,254 | 1,078 | **2,419** | 3,332 (57.9 %) |
| < 50 | 7,002 | 3,310 | 1,039 | **2,653** | 4,349 (62.1 %) |
| **All** | 34,226 | 8,848 | 5,908 | **19,470 (56.9 %)** | 14,756 (43.1 %) |

- **Excluding senses that cite a modern RAE/ASALE work** leaves **18,503** usable words (10,919 / 2,854 / 2,265 / 2,465).
- **Every letter keeps some candidates.** The rarest initials in the usable set are W 2, X 3, Ñ 5, K 10 and Y 39. Ñ, X and Y also rely on "contiene" answers: 307, 313 and 206 usable words contain them.
- **Option (a), dropping, would empty the harder bands faster** but still leave thousands of words per band.
- **Option (b), having a model write or rewrite the Clue,** applies to the 14,756 dropped words, plus any too-long definitions we choose to trim. Most of the dropped words (11,995) do appear in the 1925 edition, so a model could start from a public-domain definition rather than from nothing. That is not designed here.

## Options, briefly

1. **Wikcionario only, with the filter, and drop the rest.** No AI. About 19.5k answers under CC BY-SA. The Clue table becomes CC BY-SA, and each Clue needs a link to its source. The weak spots are long or unhelpful first senses and the provenance of the roughly 7 % of senses that cite the modern DRAE.
2. **Option 1, plus a model that only trims or rewrites the passing definitions that are too long or vague.** The model shortens text; it doesn't invent meaning. The output is still Adapted Material under CC BY-SA.
3. **Option 1, plus the public-domain 1925 DRAE for missing words.** No licence obligations for that part, but it needs an OCR parser and a human or model check against dated senses (*nevera*, *ordenador*).
4. **Option 1, plus MCR / Wikidata glosses.** Small gain (about 3.8k words, mostly easy), at the cost of a second licence and a flatter style.

**Recommendation (not a decision):** start with **option 1**. It meets "as little AI as possible", gives about 11k easy words and about 2.6k for the very hard Clues, and its licence obligations are clear and acceptable. Pick senses with the filter, prefer senses without a modern-DRAE citation, and keep the Host as the last check. Treat options 2 and 3 as later add-ons, once playtesting shows whether long or vague Clues are a real problem. It would also be worth hand-checking a few hundred Clues per band before trusting the filter's 63–65 % rate.

## Verified vs not verified

**Verified (live responses, first-party files downloaded and parsed here):**
- the Wikcionario licence footer
- the Wikimedia Terms of Use re-use and licensing clauses
- the CC BY-SA 4.0 legal code text quoted here
- the eswiktionary dump size and date
- kaikki's Spanish-edition extract (date, size, Spanish glosses, licence statement) and wiktextract's MIT licence
- all the coverage and usability figures in §1, §2 and §5, computed from the 2026-10-01 dump via kaikki and the raw wikitext
- the blanked DRAE 2001 senses
- Wikcionario's rule against copying the DRAE
- the LPI articles 8, 28, 30 and transitional provisions 2 and 4, from BOE
- the archive.org 1914 and 1925 items, their OCR, and the rough headword match
- the absence of DRAE text on Wikisource and Gutenberg
- the MCR licence (Wayback page) and the counts from the NLTK conversion
- the OMW `spa` counts and licence header
- the Wikidata Lexeme licence and count

**Not verified:**
- whether uncited Wikcionario definitions are paraphrases of the modern DRAE
- the quality of the §2 filter beyond 15 hand-checked examples and a 25-item check of the family heuristic
- edition years other than 1914 and 1925
- the US copyright status of the 1936/1939 edition, and whether US law matters for us
- whether archive.org's scans or OCR carry any claim of their own
- HathiTrust and NTLLE access and terms
- MCR's own download, and whether its Spanish glosses are machine-translated
- the 1925 coverage figure, which matches headwords only and parses no definitions
- how CC BY-SA "Adapted Material" and the database clause apply to a generated Clue table (needs a lawyer, not a note)

## Open questions for the design grilling

1. Are we comfortable publishing the Clue table under CC BY-SA 4.0, with per-Clue source links (for example on the Results screen)?
2. First sense, or the "best" sense that passes the filter? The first sense is often not the one people in Spain know (*hule*).
3. Should Wikcionario senses that cite the DRAE 2001, DLE 2014 or Diccionario de americanismos be excluded outright, at a cost of about 970 words?
4. What length cap should a Clue have, and is trimming a definition (a flagged modification) acceptable without a model?
5. Should the "Que X" / "Acción y efecto de X" family giveaways be rejected, or allowed for Fácil? `checkClue` currently catches only the exact answer.
6. Should the pool drop words whose only entries are inflected forms or variant spellings (*clienta*, *boardilla*)?
7. Should we drop the 43 % without a usable definition, or fill some of them from the 1925 edition, MCR/Wikidata or a model? And is the answer different for the very hard band?
