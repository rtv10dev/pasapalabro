# Answer words with a Difficulty: research notes

Question: Players see the same answers again and again because the model keeps picking the same words. Can we take the answers from a dictionary word list, as the TV show does with the RAE dictionary, give every word a **Difficulty** (Fácil, Normal, Difícil, plus the very hard Clues), and have the model write only the Clue? Which sources can we legally use, and which one best measures how hard a word is?

All sources were accessed on **2026-10-03** unless a date says otherwise. "Wayback" means an Internet Archive capture of the first-party URL, not a third-party copy. "Checked here" means I downloaded the file and counted or joined it myself. A scratch folder outside the repo was used for that, and nothing was added to the repo except this note.

## Short answer

**Feasible with open data. The DLE itself is not an option.**

- **The DLE has no official API and no downloadable lemma list.** The RAE's legal notice forbids "extracción y/o reutilización" of its contents for commercial ends without written permission. Its paid platform, Enclave RAE, forbids anything that lets third parties benefit from its contents. dle.rae.es and rae.es now sit behind a Cloudflare challenge, so a script or Worker can't read them anyway (§1).
- **The best Difficulty signal is word prevalence, not frequency.** SPALEX (Aguasvivas et al. 2018) gives, for **44,853 Spanish words**, the percentage of native speakers who know each word, with separate figures for Spain and Latin America. It is licensed **CC BY 4.0** and is a single 5.4 MB CSV on figshare (§4). Prevalence spreads well across the range: the median word is known by 86 % of people, and the bottom tenth by 30 % or fewer. That spread is the gradient that separates Fácil from Difícil.
- **Raw frequency is a weaker proxy.** wordfreq (Apache-2.0 code, CC BY-SA 4.0 data, frozen at 2021) covers 342k Spanish word forms. Its Spearman correlation with SPALEX prevalence on our candidate lemmas is only **0.69**. Frequency rates words such as *ben*, *ali* and *car* as common, because names and English share the same spelling. It also undervalues known-but-rare words such as *abrecartas* and *abollar* (§2, §4).
- **Open, POS-tagged lemma lists exist for the answer pool.** RLA-ES (the es_ES Hunspell dictionary) has about **47.8k** nouns, adjectives and verbs in infinitive, split by part of speech. It is licensed GPL-3 / LGPL-3 / MPL-1.1. **34,226** of those lemmas have a SPALEX score (checked here). Apertium and Wiktionary are larger alternatives (§3).
- **Size is not a problem.** 34k lemmas with a 0–100 score take 420 KB as TSV, or 150 KB gzipped. That fits inside the Worker bundle, a single KV value or a D1 table (§5).

**Main risks:** (1) **share-alike / copyleft licences**: RLA-ES, Apertium and Wiktionary carry GPL or CC BY-SA, so we must decide whether shipping a derived list counts as distributing it; (2) SPALEX tests **word forms without POS**, and was sampled from older corpora (B-PAL, EsPal); (3) the RAE's own frequency data (CREA, CORPES) has **no licence**, falls under the same "all rights reserved" notice, and the full CORPES lemma file can no longer be fetched without a browser; (4) a list can't tell whether *a model* can write a true Clue for a rare word. False Clues remain the risk ADR 0004 names.

---

## 1. The RAE dictionary (DLE)

| What | URL | Status on 2026-10-03 | Evidence |
|---|---|---|---|
| DLE entry page | `https://dle.rae.es/casa` | **403**, `cf-mitigated: challenge` ("Just a moment…") | curl here, with browser headers too |
| DLE legal notice | `https://dle.rae.es/contenido/aviso-legal` | Challenge live; Wayback `20241201001801` | text quoted below |
| RAE legal notice | `https://www.rae.es/aviso-legal` | **403** live; Wayback `20250215223631` | text quoted below |
| DLE robots.txt | `https://dle.rae.es/robots.txt` | 200: `User-agent: *` / `Disallow:` / `Crawl-delay: 1` | curl here |
| rae.es robots.txt | `https://www.rae.es/robots.txt` | 200: Drupal defaults, `Crawl-delay: 5` | curl here |
| Enclave RAE | `https://enclave.rae.es/` | **301 → `https://www.rae.es/`** | curl here; last Wayback 200 `20231206135711` |
| `api.rae.es` | `https://api.rae.es/` | does not connect | curl here |
| rae.es pages in 2026 | `https://www.rae.es/banco-de-datos/corpes-xxi` | Wayback captures from `20251228` on are **HTTP 402** `{"message":"Please contact the site owner for access."}`, served by Cloudflare | Wayback CDX + headers |

**No official API or lemma download.** None of the RAE pages I read, live or archived, offers one. A web search turned up only third-party scrapers (for example `https://apify.com/sonirico/diccionario-de-la-real-academia-de-la-lengua-espanola-rae-ppr`, `https://www.github.com/squat/drae`). Those are not RAE products. *I couldn't see the live rae.es site because of the challenge, so a very recent announcement could have slipped past me.*

**DLE legal notice** (Wayback `20241201001801`), "Derechos de propiedad intelectual":

> "quedan expresamente prohibidas la reproducción, la distribución y la comunicación pública, incluida su modalidad de puesta a disposición, de la totalidad o parte de los contenidos de esta página web, con fines comerciales, en cualquier soporte y por cualquier medio técnico, sin la autorización de la RAE."

**rae.es legal notice** (Wayback `20250215223631`) adds the database-right wording:

> "quedan expresamente prohibidas la reproducción, transformación, distribución, comunicación pública -incluida su modalidad de puesta a disposición-, extracción y/o reutilización de la Web, la totalidad o parte de los Contenidos y/o los signos distintivos de la RAE con fines comerciales, en cualquier soporte y por cualquier medio técnico, sin la autorización previa y por escrito de la RAE."

Neither version contains an express **text-and-data-mining reservation**, unlike Atresmedia's notice (see `official-clues.md` §4). Both limit the ban to "con fines comerciales". That doesn't grant a licence for non-commercial use, though: "En ningún caso se entenderá que se concede licencia alguna". "Extracción y/o reutilización" is the vocabulary of the sui generis database right, which can protect a list of headwords even though single words are not copyrightable. *That is my reading, not legal advice.*

**Enclave RAE** was the RAE's paid platform for professionals. It was web-only: "Ficha de la palabra", "Diccionario avanzado", "Corpus avanzado" and so on (archived home page `20231206135711`). Prices were shown only at checkout ("Los precios indicados en pantalla se muestran en euros", `https://enclave.rae.es/condiciones-generales-de-contratacion`, Wayback `20230928114134`). Its terms of use (`https://enclave.rae.es/condiciones-de-uso`, Wayback `20230928114436`) forbid "Utilizar la Plataforma Enclave RAE de cualquier otro modo que suponga un uso comercial" and "Usar cualquier recurso técnico […] en virtud del cual cualquier persona, usuario o no del Servicio, pueda beneficiarse, directa o indirectamente, con o sin ánimo de lucro, de los contenidos". **No API was offered, and the domain now redirects to rae.es.** I didn't find what replaced it, if anything.

**So:** the only route to the DLE is written permission from the RAE (contact via `https://www.rae.es`), and I found no product that sells it.

## 2. Frequency data

| Source | Size | Unit | Licence | How to get it | Verified |
|---|---|---|---|---|---|
| **CREA "Lista total de frecuencias"** | 737,799 rows; corpus ≈152.6 M tokens (from the normalised counts); file dated 2008-06-04 | **word forms**, no POS, proper names lower-cased (`galileo`, `juanito` in the top 10k) | None stated; RAE notice applies | `http://corpus.rae.es/lfrecuencias.html` → `/frec/CREA_total.zip` (also 1000/5000/10000 lists). **403 challenge live**; Wayback `20221206022108` has the zip | checked here (archived copy) |
| **CORPES XXI lemma list** | Top 10,000 lemmas archived (N 5,035, A 1,747, V 1,697, K = proper names 765…); corpus ≈396 M tokens at that version | **lemma + class** (N common noun, A adjective, V verb, K named entity…) | None stated; RAE notice applies | Announced 30 June 2021 with links to `https://apps2.rae.es/CORPES/estad/corpes_lemas.zip`, `corpes_formas.zip`, `corpes_elementos.zip` (`https://www.rae.es/noticia/conozca-algo-mas-el-corpes-listados-de-frecuencias`, Wayback `20210630080220`). These now **301 → `https://www.rae.es/corpes/`** (challenge). `10000_lemas.txt` survives at Wayback `20220708085252` | 10k file checked here; full zip **not** retrieved |
| CORPES XXI inventories (v1.1+) | v1.3: 438 M forms | lemma/form/POS | None stated | "Los inventarios pueden descargarse" from the CORPES app (`https://www.rae.es/banco-de-datos/corpes-xxi`, Wayback `20250926144400`) | not tried (needs a browser) |
| **wordfreq** `large_es` | 342,072 forms (small list: 34,925) | **word forms** (contains both *correr* and *corrió*) | Code Apache-2.0; data **CC BY-SA 4.0** (`https://github.com/rspeer/wordfreq` README "License") | `pip install wordfreq` 3.1.1; data in `wordfreq/data/large_es.msgpack.gz` (1.65 MB) | checked here |
| **FrequencyWords** (Hermit Dave) | `es_full.txt` 1,202,520 lines, 14.5 MB | word forms from OpenSubtitles 2018 | Code MIT, content **CC BY-SA 4.0** (README) | `https://github.com/hermitdave/FrequencyWords/tree/master/content/2018/es` | line count checked here |
| SUBTLEX-ESP (Cuetos et al. 2011) | 41 M-word subtitle corpus (per abstract) | word forms | not found | Paper: `https://www.uv.es/revispsi/articulos2.11/1CUETOS.pdf`. Ghent's current SUBTLEX page (`https://www.ugent.be/pp/experimentele-psychologie/en/research/documents`) lists US, NL and CH but **not ESP**; `crr.ugent.be` links return 404 | **not verified** |
| EsPal (Duchon et al. 2013) | not stated on the site | forms, with lemma/POS lookup | not stated | Web query tool only: `https://www.bcbl.eu/databases/espal/` (FAQ news stops in 2013); no bulk download link | partly |
| Leipzig Corpora (Spanish) | — | forms | — | `https://wortschatz.uni-leipzig.de/en/download/Spanish` sits behind an Anubis bot wall; `downloads.wortschatz-leipzig.de` returns 403 | **not verified** |
| Wiktionary frequency lists | — | — | CC BY-SA | not looked at; mostly derived from the lists above | not verified |

Notes:
- **wordfreq is frozen.** The README says the data "is a snapshot of language usage through about 2021 … the data is unlikely to be updated again", and SUNSET.md gives generative-AI pollution of the web as the reason. For a fixed answer pool that doesn't matter. Its Spanish sources are Wikipedia, OpenSubtitles 2018, NewsCrawl/GlobalVoices, Google Books, OSCAR, Twitter and Reddit. Its SUBTLEX permission covers US, UK, CH, DE and NL, **not ESP**.
- **The CREA and CORPES lists carry no licence anywhere** on the pages that offered them, so the legal notice in §1 applies. They are good reference data, but redistributing a list derived from them is the same open question as the DLE.
- **Frequency vs. difficulty (checked here).** Joining wordfreq to SPALEX's Spain prevalence over the RLA-ES lemmas (n = 26,811) gives a Spearman ρ of 0.69. Two failure patterns show up:
  - **High frequency, little known:** *ben* (Zipf 4.41, 9 % known), *ali* (4.04, 28 %), *car* (3.78, 26 %). These are names and English. Americanisms such as *balacera* (3.16, 34 %) and *afiche* (3.05, 43 %) land here too.
  - **Low frequency, widely known:** *abrecartas* (1.64, 99 %), *abollar* (1.48, 97 %), *xilófono* (2.47, 99 %).

## 3. Open lemma lists for the answer pool

| Source | Size (checked here unless noted) | POS / proper nouns | Licence | How to get it |
|---|---|---|---|---|
| **RLA-ES** (es_ES Hunspell, used by LibreOffice/Mozilla) | `ortografia/palabras/RAE/`: NombresMasculinos 13,914 lines, NombresFemeninos 11,397, Adjetivos 13,575, VerbosTransitivos 3,835 … **47,803 unique single-word nouns + adjectives + verbs**. Toponyms sit in a separate folder | **Yes**: one file per POS, verbs in infinitive (`auscultar/RED`, with Hunspell affix flags to strip). Proper nouns kept apart (`palabras/toponimos/`) | GPL-3+ **or** LGPL-3+ **or** MPL-1.1+, user's choice (`LICENSE.md`). The per-file headers mention only GPL-3+ | `https://github.com/sbosio/rla-es` (last commit 2026-09-19) |
| **Apertium** `apertium-spa` | `apertium-spa.spa.metadix` (8.3 MB): paradigms on ~32.5k nouns, ~22.9k adjectives, ~10.4k verbs, ~15.9k proper nouns (`__np`) | **Yes**: proper nouns tagged `np` and easy to drop | **GPL-2** (`COPYING`) | `https://github.com/apertium/apertium-spa` |
| **FreeLing** Spanish dictionary | not counted | full-form dictionary with EAGLES tags | Spanish dictionary: **LGPLLR**, from the Spanish Resource Grammar (UPF); the rest of FreeLing is AGPL (`COPYING` §2b.12) | `https://github.com/TALP-UPC/FreeLing` `data/es/dictionary` |
| **Wiktionary (es)** | `eswiktionary-latest-pages-articles.xml.bz2`, 89 MB, dated 2026-10-01 (`https://dumps.wikimedia.org/eswiktionary/latest/`); needs wikitext parsing | in the wikitext | **CC BY-SA 4.0 + GFDL** (`https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use`) | dump |
| **Wiktionary (en), Spanish section** via wiktextract/kaikki | "772568 distinct words", extracted 2026-09-28 from the 2026-09-02 enwiktionary dump; noun/verb/adjective/name counts include inflected forms (WebFetch summary of `https://kaikki.org/dictionary/Spanish/index.html`) | **Yes**: `pos` field, `name` for proper nouns, `form-of` marks inflections | CC BY-SA 4.0 + GFDL (Wiktionary); kaikki asks for a citation | 1 GB JSONL (marked "DEPRECATED" on the page) |

For our purposes, RLA-ES is the closest match to the show's word classes: common nouns, adjectives and infinitives, already split by POS. The folder names (`RAE/` vs `noRAE/`) suggest its lemmas were checked against the RAE dictionary. *I didn't verify that from the project's own docs, and I didn't check whether this raises the same database-right question as §1.* RLA-ES also has no difficulty signal of its own, so it has to be joined with §2 or §4.

## 4. Word difficulty: prevalence, familiarity, age of acquisition

| Dataset | Size | What it measures | Licence | Get it | Verified |
|---|---|---|---|---|---|
| **SPALEX** (Aguasvivas, Carreiras, Brysbaert, Mandera, Keuleers, Duñabeitia 2018, *Frontiers in Psychology* 9:2156) | **44,853 words** (and 56,855 nonwords). 209,351 participants, 2014–2017 (`https://pmc.ncbi.nlm.nih.gov/articles/PMC6240651/`) | Per word: `percent_total`/`prevalence_total`, plus the same split into `_nts` (native Spain) and `_ntl` (native Latin America); `freq`, `zipf` | **CC BY 4.0** for both paper and data (figshare API `licence` field) | `word_info.csv`, 5.4 MB: `https://figshare.com/articles/dataset/Word_information/5924794` (project `https://figshare.com/projects/SPALEX/29722`) | checked here |
| Aguasvivas et al. 2020, "How do Spanish speakers read words?…" (*Behavior Research Methods*) | ~45,000 words, >150,000 speakers (search summary) | vocabulary size, item knowledge by demographics | not checked | `https://addi.ehu.es/handle/10810/48761` | **not verified** |
| Alonso, Fernández & Díez 2015, *Behav Res Methods* 47:268–274 | 7,039 words | subjective age of acquisition (1–11 scale, 50 raters each) | not checked | supplementary material; PDF `https://gredos.usal.es/bitstream/10366/157238/1/GICM_Subjective%20age-of-acquisition%20norms%20for%207%2c039%20Spanish%20words.pdf` | **not verified** (search summary only) |
| "A dataset of word recognition accuracy, times, and prevalence for 4,562 verbs…" (Universidad de Murcia) | 4,562 verbs | prevalence | not checked | `https://portalinvestigacion.um.es/documentos/69401250ee6cd0098b61690f` | **not verified** (title only) |

SPALEX details (checked here):
- **The word list comes from B-PAL and EsPal, with inflected forms excluded** (paper). That makes it close to a lemma list: *casa*, *correr*, *alboroto* are in. It has **no POS column**, so POS has to come from a §3 list.
- **The distribution is well spread.** `percent_total` (0–100) has its 10th, 25th, 50th, 75th and 90th percentiles at 30, 56, 86, 98 and 99.3.
- **Examples from the archived official Rosco answers** (`official-clues.md` §2), `percent_nts` (Spain): *alboroto* 100, *bucle* 99.5, *cabestrillo* 97.7, *algarabía* 95, *zancajo* 47. *charpa* is absent.
- **Joined with RLA-ES (nouns, adjectives and verbs only): 34,226 words have a score.** By Spain-and-LatAm `percent_total`: 1,748 under 20 %, 3,607 at 20–40, 3,939 at 40–60, 5,051 at 60–80, 19,881 at 80–100.
- **Coverage of the awkward letters in that joined set:** Ñ-initial 5, X 6, Y 62, K 18, W 4. Ñ, X and Y would rely on "contiene" words, which the list already includes (for example 660 SPALEX words contain ñ).

## 5. Fit with this stack

From the Cloudflare docs as served today:
- Workers: "Worker size (uncompressed) 64 MiB" on both plans, "There is no compressed size limit", 128 MB memory per isolate (`https://developers.cloudflare.com/workers/platform/limits/`).
- KV: 25 MiB maximum value; Free plan 100,000 reads/day and 1,000 writes/day (`https://developers.cloudflare.com/kv/platform/limits/`).
- D1: 500 MB per database on Free, 10 GB on Paid; 2 MB per row (`https://developers.cloudflare.com/d1/platform/limits/`).

A list of the 34,226 joined lemmas with a rounded score measured **420 KB as TSV and 489 KB as JSON (150 KB / 155 KB gzipped)**. Even a 60k list with a few columns would stay in the low MB. All three options fit:
- bundled as a module;
- one KV value;
- a D1 table, or the existing SQLite-backed `Stock` Durable Object (`wrangler.jsonc`, migration `v2`).

Which is right depends on whether the list changes without a deploy, and whether we need to record which answers were used recently. That is a design question for later.

## Options, briefly

1. **SPALEX + RLA-ES** (verified join, 34k words). Prevalence measured on people, split by Spain and Latin America, under licences that allow use. Main costs: GPL/LGPL/MPL obligations for the RLA-ES-derived list, attribution for SPALEX (CC BY), and words outside SPALEX's 45k get no score.
2. **wordfreq (or FrequencyWords) + RLA-ES/Apertium** (≈31k RLA-ES lemmas found in wordfreq). Wider coverage, but frequency is a noisier difficulty proxy (ρ 0.69 with prevalence, with name and English collisions), and the data is CC BY-SA.
3. **CORPES XXI lemma frequencies.** The RAE's own data, with POS and named entities tagged, and the closest in spirit to "words from the RAE". But it has no licence, the full file isn't reachable without a browser, and it is still frequency, not prevalence.
4. **Hybrid:** SPALEX where a word is covered, frequency as a fallback, and the model kept as a final check that a word is fair game.

**Recommendation (not a decision):** option 1 looks most promising. Prevalence answers the question we actually have ("how many people would get this?"), the data is CC BY 4.0 and already verified here, and the join already yields about 1,700 words under 20 % known for the very hard Clues. wordfreq is the obvious fallback for words SPALEX lacks.

## Verified vs not verified

**Verified (live responses, Wayback captures of first-party URLs, or files downloaded and counted here):**
- RAE sites are behind a Cloudflare challenge, and rae.es returns 402 to the archive since late 2025
- the wording of the DLE and rae.es legal notices (as of Dec 2024 / Feb 2025)
- Enclave RAE's terms, and its redirect to rae.es
- CREA list sizes and format
- the CORPES 10k lemma file and the 2021 download links
- wordfreq: Spanish list sizes, licence, frozen status
- FrequencyWords: size and licence
- SPALEX: size, columns, licence, distribution
- RLA-ES: POS files, counts, licence
- Apertium: POS counts and licence
- FreeLing: Spanish dictionary licence
- the eswiktionary dump size and date
- Cloudflare limits
- the SPALEX × RLA-ES and SPALEX × wordfreq joins

**Not verified:**
- the *current* wording of the RAE legal notices (live pages blocked)
- whether any official RAE API launched recently
- whether the full CORPES `corpes_lemas.zip` / v1.3 inventories can still be downloaded, and on what terms
- where SUBTLEX-ESP is distributed today, and its licence
- Leipzig Corpora terms
- EsPal bulk access and terms
- the AoA (Alonso 2015), Aguasvivas 2020 and 4,562-verb datasets beyond search summaries
- kaikki figures (seen through a fetch summary, not counted)
- whether RLA-ES's `RAE/` lists were derived from the DLE
- how the database right or copyleft applies to our use (needs a lawyer, not a note)

## Open questions for the design grilling

1. Is the app public, and could it ever be commercial? The RAE notice and the copyleft licences of RLA-ES, Apertium and Wiktionary bite differently depending on the answer.
2. Do we score with Spain-only prevalence (`percent_nts`), or the pan-Hispanic figure? The UI is Spanish from Spain.
3. What prevalence bands map to Fácil, Normal, Difícil and "very hard", and should they be tuned by playtesting rather than fixed upfront?
4. What happens to good words outside SPALEX (about 13.6k RLA-ES lemmas)? Do we leave them out, score them by frequency, or ask the model?
5. Should the model be allowed to reject a drawn word it can't define reliably? Rare words raise the risk of false Clues (ADR 0004).
6. How do we stop repeats across Matches: remember recently used answers in the Stock, or draw from enough words that repeats become rare?
