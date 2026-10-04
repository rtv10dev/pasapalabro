# Pasapalabra

An online, Spanish-language version of El Rosco, the final round of the TV show Pasapalabra. Terms are in English; each notes the Spanish label the UI uses.

## Language

**Match**:
A session of play in one room for two Players, each with their own Rosco.
_UI_: Partida
_Avoid_: Game, room, round

**Hosted Match**:
A Match with a dedicated Host who does not play, instead of the Players taking turns as Host.
_UI_: Partida con Presentador
_Avoid_: Presenter mode, live mode

**Creator**:
The person who sets up a Match and assigns its Host and Player roles.
_UI_: Creador
_Avoid_: Owner, admin, leader

**Member**:
A person who has joined a Match by typing a name, the Creator included; the Host and the Players are chosen among the Members.
_UI_: none (the UI lists names)
_Avoid_: Guest, user, participant

**Lobby**:
The stage of a Match before it starts, where Members join and the Creator assigns the roles and presses Empezar.
_UI_: Sala de espera
_Avoid_: Waiting room, setup screen

**Results**:
How a Match ended, shown on every Device once both Players have finished: each Player's Hits and Misses, every Clue with its answer, and the winner: the Player with most Hits, or on equal Hits the one with fewest Misses; otherwise a draw.
_UI_: Resultados (¡Gana …! / ¡Empate!)
_Avoid_: Score, scoreboard, leaderboard

**Tally**:
Each Player's Hits, Misses and Clock so far, which the Host of a Hosted Match can show on every Device before a Turn, until they close it.
_UI_: Marcador
_Avoid_: Score, scoreboard

**Rematch**:
A new Match with the same settings and the same people as one that just ended.
_UI_: Revancha
_Avoid_: Replay, restart

**Player**:
A person who plays a Rosco within a Match.
_UI_: Jugador
_Avoid_: Contestant, participant, user

**Device**:
A phone or browser following a Match; each person in the Match uses one, and every Device shows the same state.
_UI_: Dispositivo
_Avoid_: Client, connection, socket

**Host**:
The person who reads the Clues aloud and judges the answers during a Turn: the dedicated Host in a Hosted Match, otherwise the Player who is waiting.
_UI_: Presentador
_Avoid_: Judge, referee, presenter, moderator, admin

**Mirror**:
The view on the playing Player's phone of themselves through the front camera, with their Rosco around their head.
_UI_: Espejo
_Avoid_: Camera view, selfie mode

**Rosco**:
A wheel of one Clue per letter of the Spanish alphabet that a Player must work through against the clock; the two Roscos of a Match never share an answer.
_UI_: Rosco
_Avoid_: Wheel, board, round

**Clue**:
The dictionary definition of a Word that starts with, or contains, a given letter of the Rosco; the Word is its answer, and it may also list other answers with that letter that the Host can accept.
_UI_: Definición
_Avoid_: Definition, question, hint

**Clock**:
The time a Player has left for their Rosco; both Players start a Match with the same time, chosen by the Creator.
_UI_: Tiempo
_Avoid_: Timer

**Pasapalabra**:
A Player's choice to skip the current Clue and come back to it later in the same Rosco.
_UI_: Pasapalabra
_Avoid_: Skip, pass

**Turn**:
The stretch of play in which a single Player answers with their clock running.
_UI_: Turno
_Avoid_: Round, go

**Handover**:
The short countdown after a Turn that ends on a Miss, during which its answer is shown on every Device; a Turn that ends otherwise has none. Then, unless the other Player has finished, the Turn passes to the other Player; in a Match that isn't Hosted, the Players also swap who plays and who is Host.
_UI_: Cambio de turno (Fallo when the Turn stays with the same Player)
_Avoid_: Transition, pause, break

**Pause**:
The wait while a Device the current Turn needs (the playing Player's or the Host's) has dropped, by losing its connection or by going unheard from for 10 seconds as a locked phone can: the Clock and any Handover stop, and every other Device shows who is missing, until it comes back or the Match is abandoned.
_UI_: Partida en pausa
_Avoid_: Freeze, hold, disconnection

**Abandoned Match**:
A Match that ended because a Pause lasted 60 seconds; it has no Results.
_UI_: Partida abandonada
_Avoid_: Cancelled, aborted, timed out

**Hit**:
An answer the Host judges correct; the Player keeps the Turn.
_UI_: Acierto
_Avoid_: Correct, point

**Miss**:
An answer the Host judges wrong; the answer is revealed and the Turn ends, passing to the other Player, or, once they have finished, stopping until the Host starts this Player's next Turn.
_UI_: Fallo
_Avoid_: Error, wrong

**Difficulty**:
The level of a Match (Easy, Normal or Hard) that sets how many people know the Words its Roscos are drawn from.
_UI_: Dificultad (Fácil, Normal, Difícil)
_Avoid_: Level, mode

**Word List**:
The dictionary Words that the answers of every Rosco are drawn from, each with its Prevalence and the definition that is its Clue.
_UI_: none
_Avoid_: Dictionary, lexicon, pool, vocabulary

**Word**:
An entry of the Word List: a common noun, adjective or verb in the infinitive that can be the answer of a Clue.
_UI_: Palabra
_Avoid_: Term, lemma, entry

**Blocklist**:
The Words the maintainer has ruled offensive (slurs and clearly vulgar Words), which the Word List leaves out.
_UI_: none
_Avoid_: Banned words, profanity filter, denylist

**Prevalence**:
The share of people in Spain who know a Word; it decides which Difficulty the Word belongs to.
_UI_: none
_Avoid_: Frequency, score, rarity

**Recent Answers**:
The answers of the last Roscos of each Difficulty, which aren't drawn again until enough other Roscos have been played.
_UI_: none
_Avoid_: Stock, history, cache, used words
