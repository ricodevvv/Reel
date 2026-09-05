/** Mirrors the worker's own model. Kept by hand, because one shared package for five types is not worth it. */

export type Format = "video" | "audio-m4a" | "audio-mp3";
export type JobStatus = "queued" | "running" | "success" | "failed" | "cancelled";

export type Downloaded = { name: string; size: number };

export type Job = {
  id: string;
  url: string;
  format: Format;
  maxHeight: number;
  status: JobStatus;
  trigger: string;
  title: string;
  files: Downloaded[];
  progress: number;
  error: string | null;
  pruned: boolean;
  queuedAt: number;
  startedAt: number | null;
  finishedAt: number | null;
};

export type Track = {
  position: number;
  title: string;
  artists: string;
  album: string;
  durationMs: number;
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

export type System = {
  docker: string | null;
  ytDlp: string | null;
  spotify: boolean;
  dataRoot: string;
  disk: { free: number; total: number } | null;
  jobs: number;
  running: number;
  queued: number;
  maxConcurrentJobs: number;
  maxItems: number;
  jobRetention: number;
};

export const FINISHED: JobStatus[] = ["success", "failed", "cancelled"];

export function finished(job: Job): boolean {
  return FINISHED.includes(job.status);
}

export const FORMAT_LABELS: Record<Format, string> = {
  video: "Video (mp4)",
  "audio-m4a": "Audio (m4a)",
  "audio-mp3": "Audio (mp3)",
};
