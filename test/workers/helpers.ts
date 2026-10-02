import { runDurableObjectAlarm } from "cloudflare:test";
import { env, exports } from "cloudflare:workers";
import {
  parseCreatedMatch,
  parseServerMessage,
  type Action,
  type CreateMatchRequest,
  type DeviceKey,
  type MatchView,
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
  const stock = stockOf(env);
  await stock.add(settings.difficulty, ROSCO);
  await stock.add(settings.difficulty, ROSCO);
  return createMatchAsIs(settings, creatorName);
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
  /** The next message this Device receives, in order. */
  nextMessage(): Promise<ServerMessage>;
  /** The next message, which must be a state. */
  nextState(): Promise<MatchView>;
  send(action: Action | string): void;
  /** Closes the socket; resolves with the code of the Match's close reply. */
  disconnect(code?: number): Promise<number>;
}

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
  socket.addEventListener("message", (event) => {
    if (typeof event.data !== "string") return;
    const message = parseServerMessage(event.data);
    if (!message) throw new Error(`Unexpected message: ${event.data}`);
    const waiter = waiting.shift();
    if (waiter) waiter(message);
    else received.push(message);
  });

  const device: Device = {
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
  };
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

/**
 * Runs the Match's alarm now, as if its time had come; false if none was set.
 * Lets tests move past countdowns, Clocks and Handovers without waiting.
 */
export function fireAlarm(matchId: string): Promise<boolean> {
  return runDurableObjectAlarm(env.MATCH.get(env.MATCH.idFromString(matchId)));
}
