---
status: accepted
---

# Clues are open dictionary definitions of Words drawn from a Word List, with no model

The models kept choosing the same answers, so Players saw them again and again. As on the TV show, a Rosco now draws its answers from a dictionary, and each Clue is that Word's definition. The Word List is built by a script from open data and committed: the Words are common nouns, adjectives and infinitives from RLA-ES (MPL-1.1); each Word's Difficulty comes from its Prevalence, the share of people in Spain who know it (SPALEX, CC BY 4.0); and its Clue is the first Wikcionario definition (CC BY-SA 4.0) that passes a filter. Words without such a definition, or that are slurs or clearly vulgar, are left out. This supersedes ADR 0004: with no model, a Rosco is drawn when its Match starts, so Roscos are no longer generated ahead of time.

Evidence: `docs/research/word-list-difficulty.md`, `docs/research/open-definitions.md`, `docs/research/offensive-words.md`.

## Considered Options

- **The RAE dictionary (DLE)**, as the show uses: no API or download, and its legal notice forbids reuse for commercial ends. The app may become public and commercial.
- **The model picks the answer and the Word List only checks it**: the model keeps favouring the same Words, so repeats are only reduced.
- **The model writes or rewrites Clues** for Words whose definition fails the filter: recovers about a quarter of them, but brings back the false Clues of ADR 0004. We want as little AI as possible.
- **Word frequency as Difficulty**: correlates only 0.69 with Prevalence, rating names and English words as common.
- **The 1925 RAE dictionary** (public domain) for the gaps: its definitions are dated ("ordenador: Que ordena").

## Consequences

- The Word List contains Wikcionario text, so the file is CC BY-SA 4.0. The app credits every source on a Créditos page, and links each answer in the Results to its Wikcionario entry.
- Definitions that cite the RAE as their source are left out, so we don't copy RAE text by accident. Uncited ones could still paraphrase it.
- Fixing a bad Clue means editing the build script or its filters and rebuilding the Word List, not regenerating a Rosco.
- Repeats are prevented by the Recent Answers, kept in the one Durable Object that was the Stock.
