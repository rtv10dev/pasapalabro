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
import type { Rosco } from "../shared/rosco";

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
  /**
   * The Match's two Roscos, the first one Player 1's. Fewer while the ones
   * the Stock couldn't give are being generated. Secret until the Match starts.
   */
  roscos: Rosco[];
  /** Ids are never reused, so a removed Member's id can't point at someone else. */
  nextMemberId: MemberId;
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
  /** The Devices that have the Match open right now. */
  connected: ReadonlySet<DeviceKey>;
}

/** How many Roscos a Match plays: one per Player. */
const ROSCOS_PER_MATCH = 2;

/** How long the countdown before the first Turn lasts. */
const COUNTDOWN_MS = 5000;

const graphemes = new Intl.Segmenter("es", { granularity: "grapheme" });

/**
 * Creates a Match in its Lobby, with the Creator as its first Member and no
 * Roscos yet: they arrive through addRosco.
 */
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
      roscos: [],
      nextMemberId: id + 1,
      start: null,
    },
  };
}

/** Gives the Match one of its Roscos; ignored once it has both. */
export function addRosco(state: MatchState, rosco: Rosco): MatchState {
  if (missingRoscos(state) === 0) return state;
  return { ...state, roscos: [...state.roscos, rosco] };
}

/** How many Roscos the Match still needs before it can start. */
export function missingRoscos({ roscos }: MatchState): number {
  return Math.max(0, ROSCOS_PER_MATCH - roscos.length);
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
    case "remove":
      return remove(state, action.member, context.connected);
  }
}

/** What the given Device sees of the Match right now. */
export function viewFor(
  state: MatchState,
  device: DeviceKey,
  { now, connected }: Pick<Context, "now" | "connected">,
): MatchView {
  const common = {
    settings: state.settings,
    members: state.members.map(({ id, name, device: key }) => ({
      id,
      name,
      connected: connected.has(key),
    })),
    creator: state.creator,
    roles: state.roles,
    you: memberOf(state, device)?.id ?? null,
  };
  if (!state.start) {
    return {
      ...common,
      phase: "lobby",
      roscosReady: missingRoscos(state) === 0,
      canStart: whyNotStart(state, connected) === null,
    };
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
  const id = state.nextMemberId;
  return {
    ok: true,
    state: {
      ...state,
      members: [...state.members, { id, name, device }],
      nextMemberId: id + 1,
    },
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
  const roles = { ...withoutMember(state.roles, member), [role]: member };
  return { ok: true, state: { ...state, roles } };
}

function remove(
  state: MatchState,
  id: MemberId,
  connected: ReadonlySet<DeviceKey>,
): Result {
  const member = state.members.find((each) => each.id === id);
  if (!member) return { ok: false, reason: "unknown-member" };
  if (connected.has(member.device)) {
    return { ok: false, reason: "member-connected" };
  }
  return {
    ok: true,
    state: {
      ...state,
      members: state.members.filter((each) => each !== member),
      roles: withoutMember(state.roles, id),
    },
  };
}

function start(state: MatchState, context: Context): Result {
  const reason = whyNotStart(state, context.connected);
  if (reason) return { ok: false, reason };
  return {
    ok: true,
    state: {
      ...state,
      start: {
        firstPlayer: context.random < 0.5 ? "player1" : "player2",
        countdownEndsAt: context.now + COUNTDOWN_MS,
      },
    },
  };
}

/** Why Empezar can't be pressed yet; null if it can. */
function whyNotStart(
  state: MatchState,
  connected: ReadonlySet<DeviceKey>,
): Rejection | null {
  const { settings, roles, members } = state;
  const needed = settings.hosted
    ? [roles.host, roles.player1, roles.player2]
    : [roles.player1, roles.player2];
  if (needed.includes(null)) return "roles-missing";
  const away = members.some(
    ({ id, device }) => needed.includes(id) && !connected.has(device),
  );
  if (away) return "member-disconnected";
  return missingRoscos(state) === 0 ? null : "roscos-not-ready";
}

/** The roles with the given Member taken out of any they hold. */
function withoutMember(roles: Roles, member: MemberId | null): Roles {
  const free = (holder: MemberId | null): MemberId | null =>
    holder === member ? null : holder;
  return {
    host: free(roles.host),
    player1: free(roles.player1),
    player2: free(roles.player2),
  };
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
