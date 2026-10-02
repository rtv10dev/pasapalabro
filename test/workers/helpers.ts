import { runDurableObjectAlarm } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  parseCreatedMatch,
  parseServerMessage,
  PING,
  PONG,
  type Action,
  type CreateMatchRequest,
  type DeviceKey,
  type MatchView,
  type PlayerRole,
  type PlayingView,
  type ServerMessage,
  type Settings,
} from "../../src/shared/protocol";
import { LETTERS, type Rosco } from "../../src/shared/rosco";
import { stockOf } from "../../src/worker/stock";
import { modelClue } from "../fixtures/clues";

const BASE = "https://pasapalabra.test";

export const UNHOSTED: Settings = {
  difficulty: "normal",
  clockSeconds: 180,
  hosted: false,
};

/** Sends a request to the Worker, as a browser would. */
export function request(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

/** Sends `POST /api/matches` with the given JSON body. */
export function postMatch(body: unknown): Promise<Response> {
  return request("/api/matches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** A new DeviceKey, as a browser generates one. */
export function newDeviceKey(): DeviceKey {
  return crypto.randomUUID();
}

const ROSCO: Rosco = LETTERS.map((letter) => {
  const { type, clue, answer } = modelClue(letter);
  return {
    letter,
    contains: type === "contiene",
    text: clue,
    answer,
    veryHard: false,
  };
});

/**
 * Creates a Match through the API; returns its id and the Creator's Device.
 * Puts two Roscos in the Stock first, so the Match never generates any.
 */
export async function createMatch(
  settings: Settings = UNHOSTED,
  creatorName = "Ana",
): Promise<{ id: string; creator: DeviceKey }> {
  await stockUp(settings);
  return createMatchAsIs(settings, creatorName);
}

/** Puts two Roscos of the settings' Difficulty in the Stock: enough for one Match. */
export async function stockUp(settings: Settings = UNHOSTED): Promise<void> {
  const stock = stockOf(env);
  await stock.add(settings.difficulty, ROSCO);
  await stock.add(settings.difficulty, ROSCO);
}

/** Creates a Match through the API with the Stock as it is. */
export async function createMatchAsIs(
  settings: Settings = UNHOSTED,
  creatorName = "Ana",
): Promise<{ id: string; creator: DeviceKey }> {
  const creator = newDeviceKey();
  const body: CreateMatchRequest = {
    settings,
    creator: { name: creatorName, device: creator },
  };
  const response = await postMatch(body);
  const created = parseCreatedMatch(await response.json());
  if (!created) throw new Error(`Unexpected response: ${response.status}`);
  return { id: created.id, creator };
}

/** A well-formed Match id that was never issued: a real one with its last hex digit changed. */
export async function neverIssuedMatchId(): Promise<string> {
  const { id } = await createMatch();
  return id.slice(0, -1) + (id.endsWith("0") ? "1" : "0");
}

export interface Device {
  key: DeviceKey;
  /** The next message this Device receives, in order. */
  nextMessage(): Promise<ServerMessage>;
  /** The next message, which must be a state. */
  nextState(): Promise<MatchView>;
  send(action: Action | string): void;
  /** Closes the socket; resolves with the code of the Match's close reply. */
  disconnect(code?: number): Promise<number>;
  /** Stops pinging the Match but leaves the socket open, as a locked phone can. */
  lock(): void;
}

/** What `fireAlarm` needs of each Device following a Match. */
interface Following {
  /** Messages received so far, pongs aside. */
  received(): number;
  /** Pings the Match, as a visible page does; resolves once answered. Does nothing once locked. */
  ping(): Promise<void>;
}

/** The Devices following each Match, by its id, until they close their socket. */
const following = new Map<string, Set<Following>>();

export function openSocket(
  matchId: string,
  device: string | null,
  headers: HeadersInit = { Upgrade: "websocket" },
): Promise<Response> {
  const query = device === null ? "" : `?device=${device}`;
  return request(`/api/matches/${matchId}/ws${query}`, { headers });
}

export async function connectDevice(
  matchId: string,
  key: DeviceKey = newDeviceKey(),
): Promise<Device> {
  const response = await openSocket(matchId, key);
  const socket = response.webSocket;
  if (!socket) throw new Error(`No WebSocket, status ${response.status}`);
  socket.accept();

  const received: ServerMessage[] = [];
  const waiting: ((message: ServerMessage) => void)[] = [];
  const pongs: (() => void)[] = [];
  let count = 0;
  let locked = false;
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    if (event.data === PONG) {
      pongs.shift()?.();
      return;
    }
    count += 1;
    const message = parseServerMessage(event.data);
    if (!message) throw new Error(`Unexpected message: ${event.data}`);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else received.push(message);
  });

  const device: Device = {
    key,
    nextMessage() {
      const message = received.shift();
      if (message) return Promise.resolve(message);
      return new Promise((resolve) => waiting.push(resolve));
    },
    async nextState() {
      const message = await device.nextMessage();
      if (message.type !== "state") {
        throw new Error(`Expected a state, got ${JSON.stringify(message)}`);
      }
      return message.state;
    },
    send(action) {
      socket.send(typeof action === "string" ? action : JSON.stringify(action));
    },
    disconnect(code) {
      const replied = new Promise<number>((resolve) => {
        socket.addEventListener("close", (event) => {
          resolve(event.code);
        });
      });
      socket.close(code);
      return replied;
    },
    lock() {
      locked = true;
    },
  };

  const devices = following.get(matchId) ?? new Set();
  following.set(matchId, devices);
  const follower: Following = {
    received: () => count,
    ping() {
      if (locked) return Promise.resolve();
      const answered = new Promise<void>((resolve) => pongs.push(resolve));
      socket.send(PING);
      return answered;
    },
  };
  devices.add(follower);
  socket.addEventListener("close", () => {
    devices.delete(follower);
  });
  return device;
}

/** Connects a new Device and joins it under the given name; returns its Member id. */
export async function join(
  matchId: string,
  name: string,
): Promise<{ device: Device; id: number }> {
  const device = await connectDevice(matchId);
  await device.nextState();
  device.send({ type: "join", name });
  const { you } = await device.nextState();
  if (you === null) throw new Error("Join failed");
  return { device, id: you };
}

/** Skips states until one matches; Devices also get a state whenever another one connects or leaves. */
export async function nextStateWhere(
  device: Device,
  matches: (view: MatchView) => boolean,
): Promise<MatchView> {
  let view = await device.nextState();
  while (!matches(view)) view = await device.nextState();
  return view;
}

/** More alarms than any Match sets before a change: a 300 s Clock, checked every 5 s. */
const MAX_ALARMS = 100;

/**
 * Runs the Match's alarms now, as if their time had come, until one changes
 * what the Devices following it see; false if none was set. Lets tests
 * move past countdowns, Clocks, Handovers and Pauses without waiting.
 * Meanwhile every Device that isn't locked pings the Match before each
 * alarm, as a visible page does, so only locked ones go silent.
 */
export async function fireAlarm(matchId: string): Promise<boolean> {
  const stub = env.MATCH.get(env.MATCH.idFromString(matchId));
  const devices = [...(following.get(matchId) ?? [])];
  const received = (): number =>
    devices.reduce((sum, device) => sum + device.received(), 0);
  // A pong comes after whatever the Match sent before it, so once each
  // Device has its pong, it has every state sent until then.
  const pingAll = () => Promise.all(devices.map((device) => device.ping()));
  await pingAll();
  const before = received();
  for (let alarms = 0; alarms < MAX_ALARMS; alarms += 1) {
    if (!(await runDurableObjectAlarm(stub))) return alarms > 0;
    await pingAll();
    if (received() > before) return true;
  }
  throw new Error(`No change after ${MAX_ALARMS} alarms`);
}

export function isPlaying(view: MatchView): view is PlayingView {
  return view.phase === "playing";
}

/** Waits for a playing state that matches. */
export async function nextPlaying(
  device: Device,
  matches: (view: PlayingView) => boolean = () => true,
): Promise<PlayingView> {
  const view = await nextStateWhere(
    device,
    (each) => isPlaying(each) && matches(each),
  );
  if (!isPlaying(view)) throw new Error("Not playing");
  return view;
}

/**
 * A Match with Ana (the Creator) as Player 1, Bea as Player 2 and, if
 * Hosted, Carlos as Host, past its countdown: both Players pressed ¡Listo!
 * and the countdown's alarm has run.
 */
export async function firstTurn(settings: Settings = UNHOSTED): Promise<{
  id: string;
  players: Record<PlayerRole, Device>;
  /** Carlos's Device in a Hosted Match; null otherwise. */
  host: Device | null;
  first: PlayerRole;
}> {
  const { id, creator } = await createMatch(settings);
  const ana = await connectDevice(id, creator);
  const { you: anaId } = await ana.nextState();
  const bea = await join(id, "Bea");
  const carlos = settings.hosted ? await join(id, "Carlos") : null;
  if (carlos) ana.send({ type: "assign", role: "host", member: carlos.id });
  ana.send({ type: "assign", role: "player1", member: anaId });
  ana.send({ type: "assign", role: "player2", member: bea.id });
  ana.send({ type: "start" });
  const started = await nextStateWhere(ana, (view) => view.phase === "started");
  if (started.phase !== "started") throw new Error("Not started");
  ana.send({ type: "ready" });
  bea.device.send({ type: "ready" });
  await nextStateWhere(
    ana,
    (view) => view.phase === "started" && view.countdownMs !== null,
  );
  if (!(await fireAlarm(id))) throw new Error("No countdown alarm");
  return {
    id,
    players: { player1: ana, player2: bea.device },
    host: carlos?.device ?? null,
    first: started.firstPlayer,
  };
}
