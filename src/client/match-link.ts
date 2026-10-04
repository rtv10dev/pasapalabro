const MATCH_PATH = /^\/m\/([^/?#\s]+)$/;

/** The id of the Match a page's path is for, or null for any other page. */
export function matchIdFromPath(pathname: string): string | null {
  return MATCH_PATH.exec(pathname)?.[1] ?? null;
}

/**
 * The id of the Match a scanned QR code links to, or null when it isn't a
 * Match of this site (`origin`, as in `location.origin`). The Lobby's QR code
 * holds its exact link, so anything else is refused rather than followed.
 */
export function matchIdFromScan(text: string, origin: string): string | null {
  const link = text.trim();
  if (!link.startsWith(`${origin}/`)) return null;
  return matchIdFromPath(link.slice(origin.length));
}
