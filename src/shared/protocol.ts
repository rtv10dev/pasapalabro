/** Everything a Device needs to render a Match; sent in full on every change. */
export interface MatchState {
  devices: number;
}

/** A message the Match sends to its Devices over the WebSocket. */
export interface StateMessage {
  type: "state";
  state: MatchState;
}

/** Validates a WebSocket message from the Match; null if it isn't one. */
export function parseStateMessage(data: string): StateMessage | null {
  let message: unknown;
  try {
    message = JSON.parse(data);
  } catch {
    return null;
  }
  if (
    typeof message !== "object" ||
    message === null ||
    !("type" in message) ||
    message.type !== "state" ||
    !("state" in message) ||
    typeof message.state !== "object" ||
    message.state === null ||
    !("devices" in message.state) ||
    typeof message.state.devices !== "number"
  ) {
    return null;
  }
  return { type: "state", state: { devices: message.state.devices } };
}

/** The body of `POST /api/matches`. */
export interface CreatedMatch {
  id: string;
}

/** Validates the body of `POST /api/matches`; null if it isn't one. */
export function parseCreatedMatch(body: unknown): CreatedMatch | null {
  if (
    typeof body !== "object" ||
    body === null ||
    !("id" in body) ||
    typeof body.id !== "string"
  ) {
    return null;
  }
  return { id: body.id };
}
