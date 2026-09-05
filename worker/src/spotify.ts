import { config } from "./config.js";
import { log } from "./log.js";
import type { Playlist, Track } from "./model.js";

const ACCOUNTS = "https://accounts.spotify.com/api/token";
const API = "https://api.spotify.com/v1";
const TIMEOUT_MS = 15_000;
const PAGE = 100;

/**
 * Reads what a public playlist contains. Metadata only.
 *
 * There is deliberately no audio anywhere in this file. Spotify does not hand out the recordings,
 * and the tools that claim to "download a playlist" work by matching each title against some other
 * site and taking a copy from there. What is genuinely useful — and what this does — is the track
 * list itself: enough to rebuild the playlist on another service, or to keep a record of it.
 *
 * Client credentials, which can only see public playlists. Reading a private one would mean asking
 * a person to sign in, and this needs nothing that belongs to a person.
 */

export function configured(): boolean {
  return Boolean(config.spotify.clientId && config.spotify.clientSecret);
}

let cached: { token: string; until: number } | null = null;

async function token(): Promise<string | null> {
  if (cached && cached.until > Date.now()) return cached.token;

  const basic = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString("base64");
  const response = await fetch(ACCOUNTS, {
    method: "POST",
    headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!response.ok) {
    log.warn(`spotify refused the credentials with ${response.status}`);
    return null;
  }
  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (typeof payload.access_token !== "string") return null;

  // A minute short of the real expiry, so a request never starts with a token that dies mid-flight.
  cached = { token: payload.access_token, until: Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000 };
  return cached.token;
}

async function get<T>(path: string, bearer: string): Promise<T | { status: number }> {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${bearer}`, accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) return { status: response.status };
  return (await response.json()) as T;
}

/** The shapes this reads out of Spotify's answers. Everything else in them is ignored. */
type ApiTrack = {
  name?: string;
  duration_ms?: number;
  artists?: { name?: string }[];
  album?: { name?: string };
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
};

type ApiPage = { items?: { track?: ApiTrack | null }[]; total?: number; next?: string | null };

const FIELDS =
  "items(track(name,duration_ms,external_ids(isrc),external_urls(spotify),artists(name),album(name))),total,next";

function toTrack(raw: ApiTrack, position: number): Track {
  return {
    position,
    title: raw.name ?? "",
    artists: (raw.artists ?? []).map((artist) => artist.name ?? "").filter(Boolean).join(", "),
    album: raw.album?.name ?? "",
    durationMs: raw.duration_ms ?? 0,
    isrc: raw.external_ids?.isrc ?? "",
    url: raw.external_urls?.spotify ?? "",
  };
}

export type PlaylistResult = Playlist | { error: string };

export async function readPlaylist(id: string): Promise<PlaylistResult> {
  if (!configured()) {
    return { error: "Spotify credentials are not configured on this installation." };
  }

  const bearer = await token();
  if (!bearer) return { error: "Spotify would not accept the configured credentials." };

  const head = await get<{ name?: string; description?: string; owner?: { display_name?: string } }>(
    `/playlists/${id}?fields=name,description,owner(display_name)`,
    bearer,
  );
  if ("status" in head) {
    // 404 is what Spotify answers for a private playlist as well as a missing one, and saying so
    // saves somebody ten minutes of checking whether they typed the link correctly.
    if (head.status === 404) return { error: "No public playlist with that link. A private one cannot be read here." };
    return { error: `Spotify answered ${head.status}.` };
  }

  const tracks: Track[] = [];
  let offset = 0;
  let total = 0;

  // Paged rather than asked for all at once, because Spotify caps a page at 100 whatever is asked
  // for, and a playlist of a few thousand is ordinary.
  for (;;) {
    const page = await get<ApiPage>(
      `/playlists/${id}/tracks?limit=${PAGE}&offset=${offset}&fields=${encodeURIComponent(FIELDS)}`,
      bearer,
    );
    if ("status" in page) return { error: `Spotify answered ${page.status} while reading the tracks.` };

    total = page.total ?? tracks.length;
    for (const item of page.items ?? []) {
      // A track removed from Spotify's catalogue stays in the playlist as a null, and it is still
      // worth a numbered row: the position is what a person matches against their own copy.
      if (item.track) tracks.push(toTrack(item.track, tracks.length + 1));
      else tracks.push({ position: tracks.length + 1, title: "(no longer available)", artists: "", album: "", durationMs: 0, isrc: "", url: "" });
    }

    offset += PAGE;
    if (!page.next || (page.items ?? []).length === 0) break;
  }

  return {
    id,
    name: head.name ?? "Untitled playlist",
    owner: head.owner?.display_name ?? "",
    description: head.description ?? "",
    total,
    tracks,
  };
}

/** RFC 4180: quote every field, and double a quote that appears inside one. */
function csvCell(value: string | number): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

export function toCsv(playlist: Playlist): string {
  const header = ["position", "title", "artists", "album", "duration", "isrc", "url"];
  const rows = playlist.tracks.map((track) =>
    [
      track.position,
      track.title,
      track.artists,
      track.album,
      formatDuration(track.durationMs),
      track.isrc,
      track.url,
    ]
      .map(csvCell)
      .join(","),
  );
  // CRLF and a BOM, because the overwhelmingly likely next step is opening this in a spreadsheet,
  // and Excel reads a UTF-8 file without one as Latin-1.
  return `﻿${[header.map(csvCell).join(","), ...rows].join("\r\n")}\r\n`;
}

function formatDuration(millis: number): string {
  const seconds = Math.round(millis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
