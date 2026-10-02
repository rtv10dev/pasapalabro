import { parseDeviceKey, type DeviceKey } from "../shared/protocol";

const storageKey = (matchId: string): string => `pasapalabra:device:${matchId}`;

/** Remembers this browser's DeviceKey for a Match, so a reload keeps its identity. */
export function rememberDeviceKey(matchId: string, key: DeviceKey): void {
  try {
    localStorage.setItem(storageKey(matchId), key);
  } catch {
    // Storage blocked (private mode): the identity lasts until a reload.
  }
}

/** This browser's DeviceKey for a Match, created the first time. */
export function deviceKeyFor(matchId: string): DeviceKey {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(storageKey(matchId));
  } catch {
    // Storage blocked: fall through to a new key.
  }
  const existing = parseDeviceKey(stored);
  if (existing) return existing;
  const key = newDeviceKey();
  rememberDeviceKey(matchId, key);
  return key;
}

/**
 * A random UUID v4. Built from getRandomValues because crypto.randomUUID only
 * exists in secure contexts, and phones on the LAN reach `wrangler dev` over
 * plain http.
 */
export function newDeviceKey(): DeviceKey {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0"));
  return [
    hex.slice(0, 4),
    hex.slice(4, 6),
    hex.slice(6, 8),
    hex.slice(8, 10),
    hex.slice(10),
  ]
    .map((group) => group.join(""))
    .join("-");
}
