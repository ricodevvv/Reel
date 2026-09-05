import { bad } from "./http.js";
import type { Format } from "./model.js";

export function text(value: unknown, field: string, { max = 200, required = false } = {}): string {
  if (value === undefined || value === null) {
    if (required) throw bad(`${field} is required`);
    return "";
  }
  if (typeof value !== "string") throw bad(`${field} must be text`);
  const trimmed = value.trim();
  if (required && !trimmed) throw bad(`${field} is required`);
  if (trimmed.length > max) throw bad(`${field} is longer than ${max} characters`);
  return trimmed;
}

/**
 * Hosts a fetch must never be aimed at.
 *
 * The fetcher runs inside this machine's network, so a URL pointing at a private address would
 * have it read something only the host can reach — a cloud metadata endpoint being the classic.
 * A signed-in operator is trusted, but not with a shape of request that has no legitimate use here.
 */
const PRIVATE_HOST =
  /^(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?|\[?f[cd])/i;

/**
 * A media URL this tool is willing to hand to yt-dlp.
 *
 * Only http and https: yt-dlp accepts a great deal more, including forms that read a local file
 * or run a helper, and none of that is what a URL box on a web panel is for.
 */
export function mediaUrl(value: unknown): string {
  const raw = text(value, "URL", { max: 2000, required: true });

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw bad("That does not look like a URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw bad("Only http and https URLs are accepted");
  if (PRIVATE_HOST.test(url.hostname)) throw bad("That address is on this machine's own network");
  return url.toString();
}

const FORMATS: readonly Format[] = ["video", "audio-m4a", "audio-mp3"];

export function format(value: unknown): Format {
  if (value === undefined || value === null || value === "") return "video";
  const found = FORMATS.find((option) => option === value);
  if (!found) throw bad(`Format must be one of ${FORMATS.join(", ")}`);
  return found;
}

/** A cap on video height. 0 means whatever the source's best is. */
export function maxHeight(value: unknown): number {
  if (value === undefined || value === null || value === "") return 0;
  const height = Number(value);
  if (!Number.isFinite(height) || height < 0 || height > 4320) throw bad("That is not a valid resolution");
  return Math.floor(height);
}

/**
 * The id inside a Spotify playlist link.
 *
 * Accepts an open.spotify.com URL, a spotify:playlist: URI, or the bare id, because all three are
 * what people actually have in their clipboard.
 */
export function playlistId(value: unknown): string {
  const raw = text(value, "Playlist", { max: 500, required: true });

  const found =
    /^[A-Za-z0-9]{22}$/.exec(raw)?.[0] ??
    /spotify:playlist:([A-Za-z0-9]{22})/.exec(raw)?.[1] ??
    /open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]{22})/.exec(raw)?.[1];

  if (!found) throw bad("That is not a Spotify playlist link");
  return found;
}
