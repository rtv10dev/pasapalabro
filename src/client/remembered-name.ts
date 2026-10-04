const STORAGE_KEY = "pasapalabra:name";

/** Remembers the name last typed to create or join a Match, to offer it next time. */
export function rememberName(name: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, name.trim());
  } catch {
    // Storage blocked (private mode): the name is typed again next time.
  }
}

/** The name last typed on this browser, or "" if none. */
export function rememberedName(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}
