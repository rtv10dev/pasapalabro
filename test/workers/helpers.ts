import { exports } from "cloudflare:workers";
import {
  parseCreatedMatch,
  type CreateMatchRequest,
  type DeviceKey,
  type Settings,
} from "../../src/shared/protocol";

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

/** Creates a Match through the API; returns its id and the Creator's Device. */
export async function createMatch(
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
