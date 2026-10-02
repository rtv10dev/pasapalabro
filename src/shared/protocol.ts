import * as z from "zod/mini";

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
const deviceKeySchema = z.uuid();
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

/** The response body of `POST /api/matches`. */
const createdMatchSchema = z.object({ id: z.string() });
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
]);
export type MatchView = z.infer<typeof matchViewSchema>;

/** A message the Match sends to a Device. */
const serverMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("state"), state: matchViewSchema }),
  z.object({ type: z.literal("rejected"), reason: z.enum(REJECTIONS) }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

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
