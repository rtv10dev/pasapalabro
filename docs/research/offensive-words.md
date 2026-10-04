# Blocking offensive answer words: research notes

Question: The game draws answer Words at random from an open Spanish lemma list (common nouns, adjectives and infinitives, Spain Spanish). Which open Spanish lists of slurs, insults and sexual or scatological words could seed a blocklist? The licence must allow public, commercial use. For each list: size, licence, regional bias, lemma vs inflected forms, and quality.

All sources were accessed on **2026-10-04**. "The pool" means the 34,226 RLA-ES lemmas with a SPALEX score from `word-list-difficulty.md` §3. "Checked here" means I downloaded the file and counted or joined it against the pool myself, in a scratch folder outside the repo.

## Short answer

**No open list can be used as is. Build our own lemma blocklist, seeded from three sources that allow commercial use, and review it by hand.**

- **LDNOOBW `es`** is CC BY 4.0, but tiny (68 entries) and noisy. It blocks *martillo*, *infierno*, *asesinato* and *heroína* (§1).
- **cuss `es`** is MIT. It has about 650 entries, each with a "sureness" rating, and is the best ready-made seed. However, it was scraped from web forums and a GQ article (§2).
- **Wiktionary sense labels** (*vulgar*, *despectivo*, *malsonante*, *ofensivo*) are CC BY-SA. They have the widest coverage: 597 of the pool's lemmas carry at least one such sense. But the labels apply to a sense, not a word. Only 94 lemmas are offensive in *every* sense, and many of those are harmless pejoratives such as *casucha* and *libraco*. Use the labels as a review queue, not as a blocklist (§3).
- **HurtLex** (CC BY-NC-SA) and **SHARE** (research use only) both rule out commercial use (§4).
- **The real problem is polysemy.** *pájaro*, *concha*, *huevo*, *paja*, *nabo* and *coger* are ordinary words with a vulgar sense. Each source handles them differently. Deciding whether to block them is a product question.

**Suggested start (not a decision):** take the union of cuss rating-2 entries, LDNOOBW single words and the Wiktionary *vulgar/malsonante/ofensivo* senses. Intersect it with the pool (a few hundred lemmas) and review that by hand once. Only cuss rating 2 and the slur/sexual core should be blocked without review.

## 1. LDNOOBW (`es` file)

- File: `https://raw.githubusercontent.com/LDNOOBW/List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words/master/es`. It has **68 lines**, 58 of them single words, in mixed case. **Checked here.** The last change to the file was 2020-01-01, adding *pendejo* (GitHub API, `commits?path=es`).
- Licence: **CC BY 4.0**, from the repo's `LICENSE` file ("Attribution 4.0 International").
- Purpose: Shutterstock filters autocomplete with it. The README says "what goes in these lists is subjective… 'What wouldn't we want to *suggest* that people look at?'" (`README.md`).
- Form: mostly lemmas, plus phrases (*Hacer una paja*, *Tetas grandes*) and a few misspellings (*Kapullo*, *Jilipollas*). The words are a mix of Spain (*gilipollas*, *follar*, *soplapollas*) and Latin America (*pendejo*, *pinche*, *verga*).
- In the pool: 37 lemmas, **checked here**. False positives for a word game: *martillo*, *infierno*, *asesinato*, *heroína*, *orina*, *racista*, *nazi*, *sexo*, *pezón*, *concha*, *asno*.

## 2. cuss (`es.js`, by wooorm)

- File: `https://raw.githubusercontent.com/wooorm/cuss/main/es.js`, package version 2.2.0. It holds **650 entries**: 501 rated 2 and 149 rated 1, with 31 multi-word entries. **Checked here.**
- Licence: **MIT**, from the `license` file and the `package.json` `"license"` field. The flat list in `https://github.com/wooorm/profanities` comes from the same data.
- The rating measures sureness, not severity. 2 means "likely" profane and "unlikely" in clean text. 1 means "maybe" (`readme.md`, "Rating" table).
- Provenance: the README cites LDNOOBW plus `revistagq.com`, `taringa.net` and `mundoxat.com` forum posts. The MIT licence covers the compilation, but whether those scraped sources allow reuse is not stated.
- Form: lemmas plus some accent-less variants (*aguayon* and *aguayón*). It leans toward Spain's insults (*mastuerzo*, *ceporro*, *papanatas*, *tragaldabas*) but includes *boludo*, *pinche* and *cerote*.
- In the pool: **183 lemmas rated 2** and **57 rated 1**, **checked here**. Rating 1 is mostly false positives: *compañero*, *comer*, *cuchillo*, *mariposa*, *volar*, *tirar*, *montar*, *papaya*, *pato*, *pájaro*, *concha*, *huevo*. Rating 2 also has some: *cuchara*, *cola*, *pistola*, *caliente*, *pisar*, *yegua*. It has **no ethnic slurs**: *sudaca*, *negro* and *gitano* are absent, as are *subnormal* and *mongólico*.

## 3. Spanish Wiktionary register labels

- Data: kaikki's wiktextract of eswiktionary, `https://kaikki.org/eswiktionary/raw-wiktextract-data.jsonl.gz`, 103,226,106 bytes, last modified 2026-10-02. The file I downloaded has the same size. **Checked here.**
- Licence: **CC BY-SA 4.0 + GFDL**, the Wiktionary terms (`https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use`).
- Page categories across all Spanish entries: *ES:Términos despectivos* 1,505, *ES:Términos malsonantes* 840, *ES:Términos vulgares* 351. Sense tags: `derogatory` 1,499, `vulgar` 1,123, plus free-text labels such as "ofensivo" and "insulto". **Checked here.**
- In the pool, counting only noun, adjective and verb senses: **203 lemmas** have a *vulgar/malsonante/ofensivo* sense and **388 more** have only a *despectivo* sense. **Checked here.** In 108 of the 203, every vulgar sense is tagged only for the Americas (*cajeta*, *argolla*, *bicho*, *chaqueta*). Those words are harmless in Spain.
- Labels apply to one sense, so ordinary words are caught: *pájaro*, *concha*, *huevo*, *queso*, *violín*, *asterisco*, *gris*, *amarillo*, *abuelo*, *taxista*. *Despectivo* also catches mild suffix pejoratives (*casucha*, *papelucho*, *flacucho*). Gaps: *teta*, *cerdo*, *guarro*, *moro* and *judío* have no tagged sense.
- Strength: the regional tags (`Spain`, `Chile`, `Mexico`…) make it possible to keep only senses used in Spain.

## 4. Lists ruled out by licence

- **HurtLex ES 1.2** (`https://github.com/valeriobasile/hurtlex`, `lexica/ES/1.2/hurtlex_ES.tsv`): **CC BY-NC-SA 4.0**, from the README's "LICENSE" section. NonCommercial rules it out. It has 5,006 rows (1,165 "conservative" lemmas), machine-translated from Italian. Quality is poor for our use: the conservative level in the pool includes *detective*, *inocente*, *orgullo*, *astuto* and *simple*. **Checked here.**
- **SHARE** (SINAI, Universidad de Jaén, `https://sinai.ujaen.es/en/research/resources/share-lexicon-harmful-expressions-spanish-population`; LREC 2022, `https://aclanthology.org/2022.lrec-1.139`): 10,125 terms collected from people in Spain via a Telegram bot. It is the best fit for Spain, but "available free for research purposes" only. *I saw this through a fetch summary and did not download it.*

## Verified vs not verified

**Verified (files downloaded and counted here, or first-party pages read):** LDNOOBW size, licence, README purpose and last change; cuss size, ratings, licence and cited sources; kaikki eswiktionary file size and date; Wiktionary category and tag counts; HurtLex size, levels and licence; all overlaps with the pool and the false positives named above.

**Not verified:**
- SHARE's exact terms (I read a fetch summary only)
- whether cuss's scraped sources permit reuse
- whether shipping or deriving a blocklist from CC BY-SA Wiktionary data triggers share-alike. If the blocklist stays server-side and only *removes* words, it may not, but that needs a lawyer.
- the Wiktionary label counts in the raw dump (I counted kaikki's extraction, not the wikitext)

## Open questions for the design grilling

1. Do we block polysemous words (*pájaro*, *concha*, *huevo*, *paja*, *coger*) outright? Or do we keep them and tell the model never to write a Clue for the vulgar sense?
2. Do we block mild insults (*tonto*, *idiota*, *palurdo*) and pejoratives (*casucha*)? Or only slurs and sexual or scatological words?
3. Do words whose offensive sense exists only in Latin America get blocked, given that the UI is Spain Spanish?
4. Does the blocklist live in the repo (attribution text needed) or only server-side?
