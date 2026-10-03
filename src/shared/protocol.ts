import * as z from "zod/mini";
import { LETTERS } from "./rosco";

export const DIFFICULTIES = ["easy", "normal", "hard"] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

/** The Clock options, in seconds per Player. */
export const CLOCK_SECONDS = [120, 180, 240, 300] as const;
export type ClockSeconds = (typeof CLOCK_SECONDS)[number];
export const DEFAULT_CLOCK_SECONDS: ClockSeconds = 180;

const settingsSchema = z.object({
  difficulty: z.enum(DIFFICULTIES),
  clockSeconds: z.union(CLOCK_SECONDS.map((seconds) => z.literal(seconds))),
  hosted: z.boolean(),
});

/** What the Creator chooses when creating a Match. */
export type Settings = z.infer<typeof settingsSchema>;

/**
 * The secret a Device generates once per Match and sends on every connection,
 * so that it keeps its identity across reloads. Never shown to other Devices.
 */
export const deviceKeySchema = z.uuid();
export type DeviceKey = z.infer<typeof deviceKeySchema>;

/** Validates a DeviceKey; null if it isn't one. */
export function parseDeviceKey(value: unknown): DeviceKey | null {
  return parseWith(deviceKeySchema, value);
}

/** The longest name a Member can have, in characters. */
export const MAX_NAME_LENGTH = 20;

const creatorSchema = z.object({ name: z.string(), device: deviceKeySchema });
/** The Creator as they create the Match: the name they typed and their Device. */
export type Creator = z.infer<typeof creatorSchema>;

/** The body of `POST /api/matches`. */
const createMatchRequestSchema = z.object({
  settings: settingsSchema,
  creator: creatorSchema,
});
export type CreateMatchRequest = z.infer<typeof createMatchRequestSchema>;

/** Validates the body of `POST /api/matches`; null if it isn't one. */
export function parseCreateMatchRequest(
  body: unknown,
): CreateMatchRequest | null {
  return parseWith(createMatchRequestSchema, body);
}

/** A Match's id, as it appears in its link. */
const matchIdSchema = z.string();
export type MatchId = z.infer<typeof matchIdSchema>;

/** The response body of `POST /api/matches`. */
const createdMatchSchema = z.object({ id: matchIdSchema });
export type CreatedMatch = z.infer<typeof createdMatchSchema>;

/** Validates the response body of `POST /api/matches`; null if it isn't one. */
export function parseCreatedMatch(body: unknown): CreatedMatch | null {
  return parseWith(createdMatchSchema, body);
}

export const PLAYER_ROLES = ["player1", "player2"] as const;
export type PlayerRole = (typeof PLAYER_ROLES)[number];
export const ROLES = ["host", ...PLAYER_ROLES] as const;
export type Role = (typeof ROLES)[number];

const memberIdSchema = z.number();
export type MemberId = z.infer<typeof memberIdSchema>;

/** How the Host can judge an answer: Acierto, Fallo or Pasapalabra. */
export const VERDICTS = ["hit", "miss", "pasapalabra"] as const;
export type Verdict = (typeof VERDICTS)[number];

/** An action a Device sends to its Match. */
const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), name: z.string() }),
  z.object({
    type: z.literal("assign"),
    role: z.enum(ROLES),
    member: z.nullable(memberIdSchema),
  }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("remove"), member: memberIdSchema }),
  /** A Player pressing ¡Listo! after Empezar. */
  z.object({ type: z.literal("ready") }),
  /** The Host pressing Empezar turno: the playing Player's clock starts. */
  z.object({ type: z.literal("begin-turn") }),
  /** The Host judging the answer to the current Clue. */
  z.object({ type: z.literal("judge"), verdict: z.enum(VERDICTS) }),
  /** The Creator pressing Revancha once the Match is over. */
  z.object({ type: z.literal("rematch") }),
]);
export type Action = z.infer<typeof actionSchema>;

/** Validates a WebSocket message from a Device; null if it isn't an Action. */
export function parseAction(data: string): Action | null {
  return parseJson(data, actionSchema);
}

export const REJECTIONS = [
  "invalid-action",
  "invalid-name",
  "name-taken",
  "already-joined",
  "not-creator",
  "already-started",
  "not-hosted",
  "unknown-member",
  "roles-missing",
  "member-disconnected",
  "member-connected",
  "not-started",
  "not-player",
  "not-host",
  "turn-not-waiting",
  "turn-not-running",
  "match-not-over",
  "already-rematched",
  "match-paused",
  "match-abandoned",
] as const;
/** Why the Match refused an Action. */
export type Rejection = (typeof REJECTIONS)[number];

const rolesSchema = z.object({
  host: z.nullable(memberIdSchema),
  player1: z.nullable(memberIdSchema),
  player2: z.nullable(memberIdSchema),
});
export type Roles = z.infer<typeof rolesSchema>;

const matchViewFields = {
  settings: settingsSchema,
  members: z.array(
    z.object({
      id: memberIdSchema,
      name: z.string(),
      /** Whether the Member's Device has the Match open right now. */
      connected: z.boolean(),
    }),
  ),
  creator: memberIdSchema,
  roles: rolesSchema,
  /** The Member using this Device; null until it joins. */
  you: z.nullable(memberIdSchema),
};

const letterSchema = z.enum(LETTERS);

/** Where a Rosco's letter stands: not answered yet, a Hit or a Miss. */
export const LETTER_RESULTS = ["pending", "hit", "miss"] as const;
export type LetterResult = (typeof LETTER_RESULTS)[number];

const roscoViewSchema = z.object({
  letters: z.array(
    z.object({ letter: letterSchema, result: z.enum(LETTER_RESULTS) }),
  ),
  /** The letter the Player answers next; null once they have finished. */
  current: z.nullable(letterSchema),
  /** Milliseconds left on the Player's Clock, as of sending. */
  clockMs: z.number(),
  /** All letters answered or the Clock at zero. */
  finished: z.boolean(),
});
export type RoscoView = z.infer<typeof roscoViewSchema>;

/**
 * Where the Turn stands: waiting for Empezar turno, the Clock running,
 * the Handover to the next Turn, both Players finished, or the Match
 * abandoned after a Pause of 60 s.
 */
export const TURN_STAGES = [
  "waiting",
  "running",
  "handover",
  "over",
  "abandoned",
] as const;
export type TurnStage = (typeof TURN_STAGES)[number];

/** The answer to a Clue the Player has just missed. */
const revealedSchema = z.object({ letter: letterSchema, answer: z.string() });
export type Revealed = z.infer<typeof revealedSchema>;

/** A Clue of a Rosco with its answer, and how the Player did on it. */
const answeredClueSchema = z.object({
  letter: letterSchema,
  contains: z.boolean(),
  text: z.string(),
  answer: z.string(),
  result: z.enum(LETTER_RESULTS),
});

/** How a Match ended: who won, and every Clue of both Roscos with its answer. */
const resultsSchema = z.object({
  /** The Player with most Hits, or on a tie fewest Misses; null for a draw. */
  winner: z.nullable(z.enum(PLAYER_ROLES)),
  clues: z.object({
    player1: z.array(answeredClueSchema),
    player2: z.array(answeredClueSchema),
  }),
});
export type Results = z.infer<typeof resultsSchema>;

/** Everything a Device needs to render a Match; sent in full on every change. */
const matchViewSchema = z.discriminatedUnion("phase", [
  z.object({
    ...matchViewFields,
    phase: z.literal("lobby"),
    canStart: z.boolean(),
  }),
  z.object({
    ...matchViewFields,
    phase: z.literal("started"),
    firstPlayer: z.enum(PLAYER_ROLES),
    /** Which Players have pressed ¡Listo!. */
    ready: z.object({ player1: z.boolean(), player2: z.boolean() }),
    /** False while the Match's Roscos are still being generated. */
    roscosReady: z.boolean(),
    /**
     * Milliseconds left in the countdown before the first Turn, as of sending:
     * a duration, so a Device with a wrong clock still counts down right.
     * Null until both Players have pressed ¡Listo! and both Roscos are ready.
     */
    countdownMs: z.nullable(z.number()),
  }),
  z.object({
    ...matchViewFields,
    phase: z.literal("playing"),
    /** The Player whose Turn it is, or comes next after the Handover. */
    turn: z.enum(PLAYER_ROLES),
    /** The Member who is Host of that Turn. */
    turnHost: memberIdSchema,
    stage: z.enum(TURN_STAGES),
    /** Milliseconds left in the Handover, as of sending; null outside one. */
    handoverMs: z.nullable(z.number()),
    roscos: z.object({ player1: roscoViewSchema, player2: roscoViewSchema }),
    /**
     * The current Clue, its answer and the other answers the Host can accept:
     * only for the Host of the Turn, and only while the Turn is waiting or
     * running. Null for everyone else.
     */
    clue: z.nullable(
      z.object({
        letter: letterSchema,
        contains: z.boolean(),
        text: z.string(),
        answer: z.string(),
        otherAnswers: z.array(z.string()),
      }),
    ),
    /**
     * Set while a Device the Turn needs has dropped: who is missing, and the
     * milliseconds left, as of sending, before the Match is abandoned. While
     * it is set, the Clock and the Handover don't move. Null otherwise.
     */
    pause: z.nullable(
      z.object({ missing: z.array(memberIdSchema), abandonMs: z.number() }),
    ),
    /** The answer to the Clue just missed, for every Device during the Handover. */
    revealed: z.nullable(revealedSchema),
    /** How the Match ended, for every Device once it is over; null until then. */
    results: z.nullable(resultsSchema),
    /** The Rematch every Device moves to, once the Creator presses Revancha. */
    rematch: z.nullable(matchIdSchema),
  }),
]);
export type MatchView = z.infer<typeof matchViewSchema>;
/** A Match whose Turns are being played. */
export type PlayingView = MatchView & { phase: "playing" };

/** A message the Match sends to a Device. */
const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: matchViewSchema }),
  z.object({ type: z.literal("rejected"), reason: z.enum(REJECTIONS) }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/**
 * What a Device sends the Match every PING_MS while its page is visible, and
 * what the Match answers: a locked phone can leave its socket open, and
 * then its pings stop.
 */
export const PING = "ping";
export const PONG = "pong";
export const PING_MS = 4000;

/** Validates a WebSocket message from the Match; null if it isn't one. */
export function parseServerMessage(data: string): ServerMessage | null {
  return parseJson(data, serverMessageSchema);
}

function parseJson<T>(data: string, schema: z.ZodMiniType<T>): T | null {
  let json: unknown;
  try {
    json = JSON.parse(data);
  } catch {
    return null;
  }
  return parseWith(schema, json);
}

function parseWith<T>(schema: z.ZodMiniType<T>, value: unknown): T | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
