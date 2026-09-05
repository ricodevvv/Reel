import { existsSync, statSync } from "node:fs";
import { basename } from "node:path";
import type { Job } from "../model.js";
import { paths } from "../paths.js";
import { capture } from "./process.js";

const ZIP_TIMEOUT_MS = 10 * 60_000;

/**
 * Bundles a job's files into one zip, built on the first request for it and kept afterwards.
 *
 * Stored rather than deflated (`-0`): every file in here is already a compressed media container,
 * so compressing again spends minutes of CPU to save nothing.
 *
 * `zip` rather than a hand-written archiver. The format is easy to get almost right and unpleasant
 * to get exactly right — ZIP64 above four gigabytes, which a playlist reaches — and this is one
 * apk package in an image that already exists.
 */
export async function archiveOf(job: Job): Promise<{ path: string; size: number } | { error: string }> {
  if (job.pruned) return { error: "This job's files have been discarded by retention." };
  if (job.files.length === 0) return { error: "This job has no files." };

  const archive = paths.archive(job.id);
  if (existsSync(archive)) return { path: archive, size: statSync(archive).size };

  const result = await capture(
    "zip",
    // The names come from the job's own record rather than a glob, so nothing that is not a
    // download — the archive itself, a leftover .part — can end up inside.
    ["-0", "-q", "-X", basename(archive), ...job.files.map((file) => file.name)],
    { cwd: paths.output(job.id), timeoutMs: ZIP_TIMEOUT_MS },
  );

  if (result.timedOut) return { error: "Building the archive took too long." };
  // zip exits 12 for "nothing to do", which here can only mean the files went away underneath it.
  if (result.code !== 0 || !existsSync(archive)) {
    return { error: result.stderr.trim() || "Could not build the archive." };
  }
  return { path: archive, size: statSync(archive).size };
}

/** A filename a browser will accept, for the archive of a job. */
export function archiveName(job: Job): string {
  const stem = job.title.replace(/[^\w\s.-]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80);
  return `${stem || "reel"}.zip`;
}
