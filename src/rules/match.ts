import {
  MAX_NAME_LENGTH,
  PLAYER_ROLES,
  type Action,
  type Creator,
  type DeviceKey,
  type LetterResult,
  type MatchId,
  type MatchView,
  type MemberId,
  type PlayerRole,
  type PlayingView,
  type Rejection,
  type Results,
  type Role,
  type Roles,
  type Revealed,
  type RoscoView,
  type Settings,
  type TurnStage,
  type Verdict,
} from "../shared/protocol";
import { shareAnswer, type Rosco } from "../shared/rosco";

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
    /** Which Players have pressed ¡Listo! since Empezar. */
    ready: Record<PlayerRole, boolean>;
    /** In epoch milliseconds; null until both Players and both Roscos are ready. */
    countdownEndsAt: number | null;
    /** The Turns, from the end of the countdown on; null until then. */
    play: Play | null;
  } | null;
  /** The Rematch the Creator started once the Match was over; null until then. */
  rematch: MatchId | null;
  /**
   * The Members whose Device didn't have the Match open when the Devices
   * following it last changed.
   */
  away: MemberId[];
}

/** The Turns of a Match. */
interface Play {
  /** The Player whose Turn it is, or comes next after the Handover. */
  turn: PlayerRole;
  progress: Record<PlayerRole, Progress>;
  /** When the playing Player's Clock started, in epoch milliseconds; null while it is stopped. */
  runningSince: number | null;
  /** Set during a Handover; null outside one. */
  handover: {
    /** In epoch milliseconds. */
    endsAt: number;
    /** The Player whose Turn just ended. */
    from: PlayerRole;
    /** The answer to the Clue just missed, if the Turn ended on a Miss. */
    revealed: Revealed | null;
  } | null;
  /**
   * When the Pause began, in epoch milliseconds; null outside one. While it
   * lasts, neither the Clock nor the Handover moves.
   */
  pausedAt: number | null;
  /** Whether a Pause lasted ABANDON_MS: then nothing changes the Match again. */
  abandoned: boolean;
}

/** How far a Player has got through their Rosco. */
interface Progress {
  /** One per letter of the Rosco, in its order. */
  results: LetterResult[];
  /** The index of the letter they answer next. */
  current: number;
  /** What was left on their Clock when it last stopped. */
  clockMs: number;
}

export type Result =
  { ok: true; state: MatchState } | { ok: false; reason: Rejection };

/**
 * The Actions `act` applies. Revancha is applied by `rematch` instead, since
 * it also needs the id of the new Match.
 */
export type MatchAction = Exclude<Action, { type: "rematch" }>;

export type RematchResult =
  | { ok: true; state: MatchState; rematchState: MatchState }
  | { ok: false; reason: Rejection };

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

/** How long a Handover between Turns lasts. */
const HANDOVER_MS = 5000;

/** How long a Pause lasts before the Match is abandoned. */
const ABANDON_MS = 60_000;

/**
 * How long a Device can go unheard from, while a Turn is being played,
 * before it counts as gone: a locked phone can leave its socket open.
 */
const SILENCE_MS = 10_000;

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
      rematch: null,
      away: [],
    },
  };
}

/**
 * Gives the Match one of its Roscos, arriving at `now`; ignored once it has
 * both, and refused if it shares an answer with the one it has, so
 * hearing the other Player's Clues never gives an answer away. The last one
 * starts the countdown if Empezar was already pressed.
 */
export function addRosco(
  state: MatchState,
  rosco: Rosco,
  now: number,
): MatchState {
  if (missingRoscos(state) === 0) return state;
  if (state.roscos.some((each) => shareAnswer(each, rosco))) return state;
  return withCountdown({ ...state, roscos: [...state.roscos, rosco] }, now);
}

/** The answers of the Roscos the Match has, which a Rosco it adds can't share. */
export function answersInMatch({ roscos }: MatchState): string[] {
  return roscos.flatMap((rosco) => rosco.map(({ answer }) => answer));
}

/** How many Roscos the Match still needs before its first Turn. */
export function missingRoscos({ roscos }: MatchState): number {
  return Math.max(0, ROSCOS_PER_MATCH - roscos.length);
}

/** Applies an Action sent by the given Device. */
export function act(
  state: MatchState,
  device: DeviceKey,
  action: MatchAction,
  context: Context,
): Result {
  if (action.type === "ready") return ready(state, device, context.now);
  if (action.type === "begin-turn") {
    return beginTurn(tick(state, context.now), device, context.now);
  }
  if (action.type === "judge") {
    return judge(tick(state, context.now), device, action.verdict, context.now);
  }
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

/**
 * The Creator pressing Revancha at `now`, once the Match is over: the Match
 * points every Device to the Rematch with the given id, which starts with the
 * same settings, Members and roles, and the other Player first. The Rematch
 * keeps nothing of this Match's play, and has no Roscos yet: they arrive
 * through addRosco.
 */
export function rematch(
  stored: MatchState,
  device: DeviceKey,
  id: MatchId,
  now: number,
): RematchResult {
  const state = tick(stored, now);
  const { start } = state;
  if (memberOf(state, device)?.id !== state.creator) {
    return { ok: false, reason: "not-creator" };
  }
  if (!start?.play || stageOf(start.play) !== "over") {
    return { ok: false, reason: "match-not-over" };
  }
  if (state.rematch !== null) return { ok: false, reason: "already-rematched" };
  return {
    ok: true,
    state: { ...state, rematch: id },
    rematchState: {
      settings: state.settings,
      members: state.members,
      creator: state.creator,
      roles: state.roles,
      roscos: [],
      nextMemberId: state.nextMemberId,
      start: {
        firstPlayer: otherPlayer(start.firstPlayer),
        ready: { player1: false, player2: false },
        countdownEndsAt: null,
        play: null,
      },
      rematch: null,
      away: [],
    },
  };
}

/**
 * The Devices following the Match changed at `now`: `connected` are the
 * ones that have it open. A Device the current Turn needs dropping pauses
 * the Match; once they are all back, it goes on. Devices found gone only
 * after they `dropped`, like ones gone silent, pause it from the first time
 * the Turn missed one it needed, or from when the Turn last moved if that
 * was later.
 */
export function devicesChanged(
  stored: MatchState,
  connected: ReadonlySet<DeviceKey>,
  now: number,
  dropped: ReadonlyMap<DeviceKey, number> = new Map(),
): MatchState {
  const awayAt = (time: number): MemberId[] =>
    stored.members
      .filter(
        ({ device }) =>
          !connected.has(device) && (dropped.get(device) ?? now) <= time,
      )
      .map(({ id }) => id);
  const times = [...new Set(dropped.values())]
    .filter((time) => time < now)
    .sort((a, b) => a - b);
  let state = stored;
  for (const time of times) {
    state = { ...tick(state, time), away: awayAt(time) };
    const play = state.start?.play;
    if (play && missingFrom(state, play).length > 0) {
      state = inPlay(state, pauseOrResume(state, play, lastMoved(play, time)));
      break;
    }
  }
  const ticked = { ...tick(state, now), away: awayAt(now) };
  const play = ticked.start?.play;
  return play ? inPlay(ticked, pauseOrResume(ticked, play, now)) : ticked;
}

/**
 * The latest of `time` and when the Clock or the Handover last started, so
 * a Pause that starts then gives back no time the Turn didn't run.
 */
function lastMoved(play: Play, time: number): number {
  return Math.max(
    time,
    play.runningSince ?? time,
    play.handover ? play.handover.endsAt - HANDOVER_MS : time,
  );
}

/**
 * Which Devices count as gone at `now`, given when each was last heard
 * from: while a Turn is being played, the ones unheard for SILENCE_MS.
 */
export function silent<T>(
  stored: MatchState,
  heard: ReadonlyMap<T, number>,
  now: number,
): T[] {
  if (!listening(tick(stored, now))) return [];
  return [...heard]
    .filter(([, at]) => now - at >= SILENCE_MS)
    .map(([device]) => device);
}

/**
 * Whether the Match listens for Devices going silent: from the end of the
 * countdown until the Match is over or abandoned.
 */
export function listening(state: MatchState): boolean {
  const play = state.start?.play;
  return play ? !play.abandoned && !isOver(play.progress) : false;
}

/** What the given Device sees of the Match right now. */
export function viewFor(
  stored: MatchState,
  device: DeviceKey,
  { now, connected }: Pick<Context, "now" | "connected">,
): MatchView {
  const state = tick(stored, now);
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
      canStart: whyNotStart(state, connected) === null,
    };
  }
  const { firstPlayer, ready, countdownEndsAt, play } = state.start;
  if (play) return playView(state, play, common, now);
  return {
    ...common,
    phase: "started",
    firstPlayer,
    ready,
    roscosReady: missingRoscos(state) === 0,
    countdownMs:
      countdownEndsAt === null ? null : Math.max(0, countdownEndsAt - now),
  };
}

/**
 * Applies what time alone changes, up to `now`: the countdown ending,
 * Clocks reaching zero, Handovers ending and Pauses running out.
 */
export function tick(state: MatchState, now: number): MatchState {
  const { start } = state;
  if (!start || start.countdownEndsAt === null) return state;
  if (now < start.countdownEndsAt) return state;
  const play = advance(
    state,
    start.play ??
      pauseOrResume(
        state,
        firstPlay(state, start.firstPlayer),
        start.countdownEndsAt,
      ),
    now,
  );
  return play === start.play ? state : inPlay(state, play);
}

/** Applies to the Turns what time alone changes, up to `now`. */
function advance(state: MatchState, play: Play, now: number): Play {
  if (play.abandoned) return play;
  if (play.pausedAt !== null) {
    return now >= play.pausedAt + ABANDON_MS
      ? { ...play, abandoned: true }
      : play;
  }
  if (play.runningSince !== null) {
    const clockOut = play.runningSince + play.progress[play.turn].clockMs;
    if (now >= clockOut) {
      const ended = endTurn(play, clockOut, null);
      return advance(state, pauseOrResume(state, ended, clockOut), now);
    }
  }
  if (play.handover && now >= play.handover.endsAt) {
    return advance(state, { ...play, handover: null }, now);
  }
  return play;
}

/**
 * Pauses the Match at `now` if a Device its current Turn needs has dropped,
 * or ends the Pause once they are all back: the Clock and any Handover then
 * go on from where they stopped.
 */
function pauseOrResume(state: MatchState, play: Play, now: number): Play {
  if (play.abandoned || isOver(play.progress)) return play;
  if (missingFrom(state, play).length > 0) {
    return play.pausedAt === null ? { ...play, pausedAt: now } : play;
  }
  if (play.pausedAt === null) return play;
  const pauseMs = now - play.pausedAt;
  return {
    ...play,
    pausedAt: null,
    runningSince:
      play.runningSince === null ? null : play.runningSince + pauseMs,
    handover: play.handover && {
      ...play.handover,
      endsAt: play.handover.endsAt + pauseMs,
    },
  };
}

/** The Members the current Turn needs, the Player and their Host, whose Device has dropped. */
function missingFrom(state: MatchState, play: Play): MemberId[] {
  const needed = [state.roles[play.turn], hostOf(state, play.turn)];
  return state.away.filter((id) => needed.includes(id));
}

/**
 * When time alone next changes the Match, in epoch milliseconds: the end of
 * the countdown or of a Handover, or the running Clock reaching zero. Null
 * if nothing will change until someone acts.
 */
export function nextChange(state: MatchState): number | null {
  const start = state.start;
  if (!start || start.countdownEndsAt === null) return null;
  const { play } = start;
  if (!play) return start.countdownEndsAt;
  if (play.abandoned) return null;
  if (play.pausedAt !== null) return play.pausedAt + ABANDON_MS;
  if (play.handover) return play.handover.endsAt;
  if (play.runningSince === null) return null;
  return play.runningSince + play.progress[play.turn].clockMs;
}

function firstPlay(state: MatchState, firstPlayer: PlayerRole): Play {
  const fresh = (rosco: Rosco | undefined): Progress => ({
    results: (rosco ?? []).map(() => "pending"),
    current: 0,
    clockMs: state.settings.clockSeconds * 1000,
  });
  return {
    turn: firstPlayer,
    progress: {
      player1: fresh(state.roscos[roscoIndex("player1")]),
      player2: fresh(state.roscos[roscoIndex("player2")]),
    },
    runningSince: null,
    handover: null,
    pausedAt: null,
    abandoned: false,
  };
}

function playView(
  state: MatchState,
  play: Play,
  common: Omit<MatchView, "phase" | "canStart">,
  now: number,
): PlayingView {
  const rosco = (role: PlayerRole): RoscoView =>
    roscoView(
      state.roscos[roscoIndex(role)],
      play.progress[role],
      clockLeft(play, role, now),
    );
  const turnHost = hostOf(state, play.turn);
  const stage = stageOf(play);
  // While paused, the Handover stands where it stopped.
  const handoverAt = play.pausedAt ?? now;
  // The Clue and its answer reach no Device but the Host's, and only while
  // they read it out (ADR 0003): never the playing Player's.
  const clue =
    common.you === turnHost && (stage === "waiting" || stage === "running")
      ? state.roscos[roscoIndex(play.turn)]?.[play.progress[play.turn].current]
      : undefined;
  return {
    ...common,
    phase: "playing",
    turn: play.turn,
    turnHost,
    stage,
    handoverMs: play.handover
      ? Math.max(0, play.handover.endsAt - handoverAt)
      : null,
    handoverFrom: play.handover?.from ?? null,
    roscos: { player1: rosco("player1"), player2: rosco("player2") },
    clue: clue
      ? {
          letter: clue.letter,
          contains: clue.contains,
          text: clue.text,
          answer: clue.answer,
          otherAnswers: clue.otherAnswers ?? [],
        }
      : null,
    pause:
      play.pausedAt === null || play.abandoned
        ? null
        : {
            missing: missingFrom(state, play),
            abandonMs: Math.max(0, play.pausedAt + ABANDON_MS - now),
          },
    revealed: play.handover?.revealed ?? null,
    results: stage === "over" ? results(state, play) : null,
    rematch: state.rematch,
  };
}

function stageOf(play: Play): TurnStage {
  if (play.abandoned) return "abandoned";
  if (play.handover) return "handover";
  if (isOver(play.progress)) return "over";
  return play.runningSince === null ? "waiting" : "running";
}

/**
 * How the Match ended: most Hits wins; on a tie, fewest Misses; otherwise
 * a draw. Every Clue is shown with its answer.
 */
function results(state: MatchState, play: Play): Results {
  const count = (role: PlayerRole, result: LetterResult): number =>
    play.progress[role].results.filter((each) => each === result).length;
  // Positive when Player 1 is ahead: on Hits, then on Misses.
  const lead =
    count("player1", "hit") - count("player2", "hit") ||
    count("player2", "miss") - count("player1", "miss");
  const clues = (role: PlayerRole): Results["clues"][PlayerRole] =>
    (state.roscos[roscoIndex(role)] ?? []).map((clue, index) => ({
      letter: clue.letter,
      contains: clue.contains,
      text: clue.text,
      answer: clue.answer,
      result: play.progress[role].results[index] ?? "pending",
    }));
  return {
    winner: lead > 0 ? "player1" : lead < 0 ? "player2" : null,
    clues: { player1: clues("player1"), player2: clues("player2") },
  };
}

function roscoView(
  rosco: Rosco | undefined,
  progress: Progress,
  clockMs: number,
): RoscoView {
  const letters = (rosco ?? []).map((clue, index) => ({
    letter: clue.letter,
    result: progress.results[index] ?? "pending",
  }));
  const finished = isFinished({ ...progress, clockMs });
  return {
    letters,
    current: finished ? null : (letters[progress.current]?.letter ?? null),
    clockMs,
    finished,
  };
}

/**
 * What is left on the Player's Clock at `now`, counting the time it has been
 * running: up to the start of the Pause, if there is one.
 */
function clockLeft(play: Play, role: PlayerRole, now: number): number {
  const { clockMs } = play.progress[role];
  if (role !== play.turn || play.runningSince === null) return clockMs;
  const until = play.pausedAt ?? now;
  return Math.max(0, clockMs - (until - play.runningSince));
}

/** The Host pressing Empezar turno: the playing Player's Clock starts at `now`. */
function beginTurn(state: MatchState, device: DeviceKey, now: number): Result {
  const { start } = state;
  if (!start) return { ok: false, reason: "not-started" };
  const { play } = start;
  const held = play && heldBack(play);
  if (held) return { ok: false, reason: held };
  if (
    !play ||
    play.runningSince !== null ||
    play.handover ||
    isOver(play.progress)
  ) {
    return { ok: false, reason: "turn-not-waiting" };
  }
  if (!isHostOfTurn(state, play, device)) {
    return { ok: false, reason: "not-host" };
  }
  return withPlay(state, { ...play, runningSince: now });
}

/** The Host judging the answer to the current Clue at `now`. */
function judge(
  state: MatchState,
  device: DeviceKey,
  verdict: Verdict,
  now: number,
): Result {
  const play = state.start?.play;
  const held = play && heldBack(play);
  if (held) return { ok: false, reason: held };
  if (!play || play.runningSince === null) {
    return { ok: false, reason: "turn-not-running" };
  }
  if (!isHostOfTurn(state, play, device)) {
    return { ok: false, reason: "not-host" };
  }
  const progress = play.progress[play.turn];
  const results = progress.results.map((result, index): LetterResult =>
    index === progress.current && verdict !== "pasapalabra" ? verdict : result,
  );
  const answered = {
    ...progress,
    results,
    current: nextPending(results, progress.current),
  };
  const next = {
    ...play,
    progress: { ...play.progress, [play.turn]: answered },
  };
  // Once the other Player has finished, a Pasapalabra has nobody to hand
  // the Turn to; a Miss still stops this one.
  const playsOn =
    verdict === "hit" ||
    (verdict === "pasapalabra" &&
      isFinished(play.progress[otherPlayer(play.turn)]));
  if (playsOn && !isFinished(answered)) return withPlay(state, next);
  const clue = state.roscos[roscoIndex(play.turn)]?.[progress.current];
  const revealed =
    verdict === "miss" && clue
      ? { letter: clue.letter, answer: clue.answer }
      : null;
  return withPlay(
    state,
    pauseOrResume(state, endTurn(next, now, revealed), now),
  );
}

/** Why nobody can play on right now: the Match paused or abandoned; null if they can. */
function heldBack(play: Play): Rejection | null {
  if (play.abandoned) return "match-abandoned";
  return play.pausedAt === null ? null : "match-paused";
}

/**
 * Stops the playing Player's Clock at `now` and hands the Turn over to the
 * other Player, unless they have finished: then it stays with this one. If
 * both have finished, the Match is over, after a Handover only if there is
 * a Miss's answer to show.
 */
function endTurn(play: Play, now: number, revealed: Revealed | null): Play {
  const stopped = {
    ...play.progress[play.turn],
    clockMs: clockLeft(play, play.turn, now),
  };
  const progress = { ...play.progress, [play.turn]: stopped };
  const over = isOver(progress);
  const other = otherPlayer(play.turn);
  return {
    ...play,
    turn: isFinished(progress[other]) ? play.turn : other,
    progress,
    runningSince: null,
    handover:
      over && !revealed
        ? null
        : { endsAt: now + HANDOVER_MS, from: play.turn, revealed },
  };
}

function isOver(progress: Record<PlayerRole, Progress>): boolean {
  return PLAYER_ROLES.every((role) => isFinished(progress[role]));
}

/** Whether the Player has answered every letter or run out of time. */
function isFinished({ results, clockMs }: Progress): boolean {
  return clockMs <= 0 || !results.includes("pending");
}

/** Which of the Match's Roscos is the Player's. */
function roscoIndex(role: PlayerRole): number {
  return role === "player1" ? 0 : 1;
}

/**
 * The index of the next pending letter after `from`: on in order, then
 * lapping back over the ones left; `from` itself if it is the only one.
 */
function nextPending(results: LetterResult[], from: number): number {
  for (let step = 1; step <= results.length; step++) {
    const index = (from + step) % results.length;
    if (results[index] === "pending") return index;
  }
  return from;
}

function withPlay(state: MatchState, play: Play): Result {
  if (!state.start) return { ok: false, reason: "not-started" };
  return { ok: true, state: inPlay(state, play) };
}

/** The Match with its Turns replaced; unchanged before Empezar. */
function inPlay(state: MatchState, play: Play): MatchState {
  return state.start ? { ...state, start: { ...state.start, play } } : state;
}

function isHostOfTurn(
  state: MatchState,
  play: Play,
  device: DeviceKey,
): boolean {
  return memberOf(state, device)?.id === hostOf(state, play.turn);
}

/** Who judges the given Player's Turn: the Host, or else the other Player. */
function hostOf(state: MatchState, turn: PlayerRole): MemberId {
  const host = state.settings.hosted
    ? state.roles.host
    : state.roles[otherPlayer(turn)];
  // Empezar needs every role, and the Lobby closes with it.
  return host ?? state.creator;
}

function otherPlayer(role: PlayerRole): PlayerRole {
  return role === "player1" ? "player2" : "player1";
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
        ready: { player1: false, player2: false },
        countdownEndsAt: null,
        play: null,
      },
    },
  };
}

/** A Player pressing ¡Listo! after Empezar; pressing it again changes nothing. */
function ready(state: MatchState, device: DeviceKey, now: number): Result {
  const { start } = state;
  if (!start) return { ok: false, reason: "not-started" };
  const member = memberOf(state, device);
  const role = PLAYER_ROLES.find((each) => state.roles[each] === member?.id);
  if (!member || !role) return { ok: false, reason: "not-player" };
  if (start.ready[role]) return { ok: true, state };
  return {
    ok: true,
    state: withCountdown(
      {
        ...state,
        start: { ...start, ready: { ...start.ready, [role]: true } },
      },
      now,
    ),
  };
}

/**
 * Starts the countdown to the first Turn at `now`, if Empezar was pressed and
 * both Players and both Roscos have just become ready.
 */
function withCountdown(state: MatchState, now: number): MatchState {
  const { start } = state;
  if (!start || start.countdownEndsAt !== null) return state;
  const playersReady = PLAYER_ROLES.every((role) => start.ready[role]);
  if (!playersReady || missingRoscos(state) > 0) return state;
  return { ...state, start: { ...start, countdownEndsAt: now + COUNTDOWN_MS } };
}

/**
 * Why Empezar can't be pressed yet; null if it can. The Roscos don't have
 * to be ready: the countdown after Empezar waits for them, and for the
 * Players to press ¡Listo!.
 */
function whyNotStart(
  { settings, roles, members }: MatchState,
  connected: ReadonlySet<DeviceKey>,
): Rejection | null {
  const needed = settings.hosted
    ? [roles.host, roles.player1, roles.player2]
    : [roles.player1, roles.player2];
  if (needed.includes(null)) return "roles-missing";
  const away = members.some(
    ({ id, device }) => needed.includes(id) && !connected.has(device),
  );
  return away ? "member-disconnected" : null;
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
