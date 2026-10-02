import { exports } from "cloudflare:workers";
import { parseCreatedMatch } from "../src/shared/protocol";

const BASE = "https://pasapalabra.test";

/** Sends a request to the Worker, as a browser would. */
export function request(path: string, init?: RequestInit): Promise<Response> {
  return exports.default.fetch(new Request(`${BASE}${path}`, init));
}

/** Creates a Match through the API and returns its id. */
export async function createMatch(): Promise<string> {
  const response = await request("/api/matches", { method: "POST" });
  const body: unknown = await response.json();
  const created = parseCreatedMatch(body);
  if (!created) throw new Error(`Unexpected body: ${JSON.stringify(body)}`);
  return created.id;
}

/** A well-formed Match id that was never issued: a real one with its last hex digit changed. */
export async function neverIssuedMatchId(): Promise<string> {
  const id = await createMatch();
  return id.slice(0, -1) + (id.endsWith("0") ? "1" : "0");
}
