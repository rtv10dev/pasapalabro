import {
  MAX_NAME_LENGTH,
  type Action,
  type Creator,
  type DeviceKey,
  type MatchView,
  type MemberId,
  type PlayerRole,
  type Rejection,
  type Role,
  type Roles,
  type Settings,
} from "../shared/protocol";

interface Member {
  id: MemberId;
  name: string;
  /** Secret: identifies the Member's Device; never sent to other Devices. */
  device: DeviceKey;
}

/** The whole state of a Match, as the Match stores it. */
export interface MatchState {
  settings: Settings;
  members: Member[];
  creator: MemberId;
  roles: Roles;
  /** Set when the Creator presses Empezar; null while in the Lobby. */
  start: {
    firstPlayer: PlayerRole;
    /** In epoch milliseconds. */
    countdownEndsAt: number;
  } | null;
}

export type Result =
  { ok: true; state: MatchState } | { ok: false; reason: Rejection };

/** What the rules need from outside: time and randomness are passed in. */
export interface Context {
  /** The current time, in epoch milliseconds. */
  now: number;
  /** A random number in [0, 1). */
  random: number;
}

/** How long the countdown before the first Turn lasts. */
const COUNTDOWN_MS = 5000;

const graphemes = new Intl.Segmenter("es", { granularity: "grapheme" });

/** Creates a Match in its Lobby, with the Creator as its first Member. */
export function newMatch(settings: Settings, creator: Creator): Result {
  const name = memberName(creator.name);
  if (name === null) return { ok: false, reason: "invalid-name" };
  const id: MemberId = 1;
  return {
    ok: true,
    state: {
      settings,
      members: [{ id, name, device: creator.device }],
      creator: id,
      roles: { host: null, player1: null, player2: null },
      start: null,
    },
  };
}

/** Applies an Action sent by the given Device. */
export function act(
  state: MatchState,
  device: DeviceKey,
  action: Action,
  context: Context,
): Result {
  if (state.start) return { ok: false, reason: "already-started" };
  if (action.type === "join") return join(state, device, action.name);
  if (memberOf(state, device)?.id !== state.creator) {
    return { ok: false, reason: "not-creator" };
  }
  switch (action.type) {
    case "assign":
      return assign(state, action.role, action.member);
    case "start":
      return start(state, context);
  }
}

/** What the given Device sees of the Match at the given time (epoch ms). */
export function viewFor(
  state: MatchState,
  device: DeviceKey,
  now: number,
): MatchView {
  const common = {
    settings: state.settings,
    members: state.members.map(({ id, name }) => ({ id, name })),
    creator: state.creator,
    roles: state.roles,
    you: memberOf(state, device)?.id ?? null,
  };
  if (!state.start) {
    return { ...common, phase: "lobby", canStart: rolesFilled(state) };
  }
  const { firstPlayer, countdownEndsAt } = state.start;
  return {
    ...common,
    phase: "started",
    firstPlayer,
    countdownMs: Math.max(0, countdownEndsAt - now),
  };
}

function join(state: MatchState, device: DeviceKey, typed: string): Result {
  if (memberOf(state, device)) return { ok: false, reason: "already-joined" };
  const name = memberName(typed);
  if (name === null) return { ok: false, reason: "invalid-name" };
  const taken = name.toLocaleLowerCase("es");
  if (
    state.members.some(
      (member) => member.name.toLocaleLowerCase("es") === taken,
    )
  ) {
    return { ok: false, reason: "name-taken" };
  }
  const id = Math.max(...state.members.map((member) => member.id)) + 1;
  return {
    ok: true,
    state: { ...state, members: [...state.members, { id, name, device }] },
  };
}

function assign(
  state: MatchState,
  role: Role,
  member: MemberId | null,
): Result {
  if (role === "host" && !state.settings.hosted) {
    return { ok: false, reason: "not-hosted" };
  }
  if (member !== null && !state.members.some(({ id }) => id === member)) {
    return { ok: false, reason: "unknown-member" };
  }
  // A Member holds one role at most: taking this one frees any other.
  const roles: Roles = {
    host: state.roles.host === member ? null : state.roles.host,
    player1: state.roles.player1 === member ? null : state.roles.player1,
    player2: state.roles.player2 === member ? null : state.roles.player2,
  };
  return { ok: true, state: { ...state, roles: { ...roles, [role]: member } } };
}

// Both Roscos are always ready until Clue generation (#4) lands.
function start(state: MatchState, { now, random }: Context): Result {
  if (!rolesFilled(state)) return { ok: false, reason: "roles-missing" };
  return {
    ok: true,
    state: {
      ...state,
      start: {
        firstPlayer: random < 0.5 ? "player1" : "player2",
        countdownEndsAt: now + COUNTDOWN_MS,
      },
    },
  };
}

/** Whether every role the Match needs has a Member. */
function rolesFilled({ settings, roles }: MatchState): boolean {
  return (
    roles.player1 !== null &&
    roles.player2 !== null &&
    (!settings.hosted || roles.host !== null)
  );
}

/** The name as a Member would be shown; null if it can't be one. */
function memberName(typed: string): string | null {
  const name = typed.trim();
  // Counted in graphemes, as a person reads them: an emoji is one character.
  const length = [...graphemes.segment(name)].length;
  return length === 0 || length > MAX_NAME_LENGTH ? null : name;
}

function memberOf(state: MatchState, device: DeviceKey): Member | undefined {
  return state.members.find((member) => member.device === device);
}
