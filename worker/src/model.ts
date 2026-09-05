/** What the fetcher is asked to produce. */
export type Format = "video" | "audio-m4a" | "audio-mp3";

export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type Downloaded = {
  /** The name yt-dlp gave it, kept for the Content-Disposition of a download. */
  name: string;
  size: number;
};

export type Job = {
  id: string;
  url: string;
  format: Format;
  /** Cap on video height, in pixels. 0 means whatever the best available is. */
  maxHeight: number;
  status: JobStatus;
  /** Who asked for it: a session subject, or "api". */
  trigger: string;
  /** What the source turned out to be, read from yt-dlp before anything is fetched. */
  title: string;
  /** More than one for a playlist. */
  files: Downloaded[];
  /** 0 to 100, updated as the fetch runs. Best effort: some sources never report a total. */
  progress: number;
  error: string | null;
  /** Set once retention has taken this job's files away. The row stays; the contents go. */
  pruned: boolean;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export const TERMINAL: readonly JobStatus[] = ["success", "failed", "cancelled"];

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL.includes(status);
}

/** One track of a Spotify playlist, as this tool reports it. Metadata only; there is no audio here. */
export type Track = {
  position: number;
  title: string;
  artists: string;
  album: string;
  /** Milliseconds, as Spotify gives it. */
  durationMs: number;
  /** The recording's global identifier, which is what a migration to another service matches on. */
  isrc: string;
  url: string;
};

export type Playlist = {
  id: string;
  name: string;
  owner: string;
  description: string;
  total: number;
  tracks: Track[];
};
