# The Host judges every answer; the app does not listen

We wanted the app to judge answers by speech recognition, but the prototype showed it is not reliable enough to decide a Turn: Brave blocks the browser's recognition service, Safari on iPhone recognizes only the first word of a page, and server-side Whisper transcribes single words by sound ("ballena" → "va lleno", "zapato" → "el zapato" or "sapalabra"). Instead, a person judges each answer as a Hit, Miss or Pasapalabra, as on the TV show: the dedicated Host in a Hosted Match, otherwise the Player who is waiting. Every Match therefore needs two Players in one room. This supersedes ADR 0001, whose in-person rule existed because the app had to hear answers; the rule stays, now because the game is designed around people sharing a room.

Evidence: branch `prototype/engines`, page `/speech.html` and `POST /api/transcribe`.

## Considered Options

- **Recognition decides, with sound-based matching** (compare Spanish phonetic keys, skip articles): fixed each case we found, but each fix let new near-miss words through (*ñandú* vs *nandu*) and none fixed Brave or Safari.
- **Recognition suggests, a person confirms**: keeps every browser problem and cost of recognition for a verdict the person makes anyway.
- **Solo play with self-judging**: dropped; a Match always has two Players.

## Consequences

- No microphone, speech recognition or synthesized voice: the Host reads the Clues, so the app only shows them, which also removes the mic hearing the phone's own voice.
- The Host's phone must show the Clue and its answer; the playing Player's phone must not.
- Without a dedicated Host, a Player judges their opponent and gains from calling Misses. We accept this: everyone in the room hears the answer, so disputes are settled socially, not by the app.
