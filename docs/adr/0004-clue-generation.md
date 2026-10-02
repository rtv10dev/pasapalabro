# Roscos are generated ahead of time by Gemini, with gpt-oss-120b as fallback

A prototype generated one Normal Rosco with each candidate model and we checked every Clue by hand. Only gemini-3.8-flash (every Clue correct, TV-style vocabulary) and gpt-oss-120b on Workers AI (about 22 of 25 correct) were good enough; the rest wrote false Clues or ignored the letter. We use Gemini first and gpt-oss-120b when Gemini fails, because they fail differently: Gemini returned 503 "high demand" twice before succeeding, and gpt-oss-120b took 52 s. Neither delay is acceptable while Players wait, so Roscos are generated ahead of time and a Match takes one that is ready.

Evidence: branch `prototype/engines`, page `/clues.html` and `POST /api/rosco`.

## Considered Options

- **Llama 4 Scout, Llama 3.3 70B, Mistral Small 3.1** (Workers AI, cheaper and faster): rejected for quality. Scout passed every automatic check while writing about ten false Clues ("avellana: fruto del nogal").
- **gemini-3.5-flash-lite**: ignored the letter for 10 of 25 Clues after three regeneration rounds.
- **Workers AI only**, to stay on one provider (ADR 0002): its best model is slower and weaker than Gemini.

## Consequences

- A Gemini API key is a server-side secret, and a second vendor's free-tier quota now limits how many Roscos we can make.
- Automatic checks catch only the form of a Clue (letter, empieza/contiene, answer not in the Clue), not whether it is true. Model choice is our main defence against false Clues; the Host, who sees the answer, is the last one.
- A failed request (503, timeout) is retried with backoff and never counted as a bad Clue; in the prototype it used up two of the three regeneration rounds.
