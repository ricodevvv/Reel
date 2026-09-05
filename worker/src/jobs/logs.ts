import { createWriteStream, existsSync, openSync, readSync, closeSync, statSync, rmSync, type WriteStream } from "node:fs";
import { paths } from "../paths.js";
import { config } from "../config.js";
import { plain } from "../util/text.js";

type Listener = (chunk: string) => void;

/**
 * One build's log: appended to disk, and fanned out to whoever is watching it live.
 *
 * The file is the record and the listeners are a convenience, in that order. A viewer that
 * connects late replays the file and then joins the stream, so it sees the whole log either way.
 */
export class JobLog {
  private readonly file: WriteStream;
  private readonly listeners = new Set<Listener>();
  private closed = false;

  constructor(readonly jobId: string) {
    this.file = createWriteStream(paths.logFile(jobId), { flags: "a" });
  }

  write(text: string): void {
    if (this.closed) return;
    const chunk = plain(text);
    if (!chunk) return;
    this.file.write(chunk);
    for (const listener of this.listeners) listener(chunk);
  }

  /** A line of the panel's own commentary, set apart from the build tool's own output. */
  say(message: string): void {
    this.write(`\n>>> ${message}\n`);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.file.end();
    this.listeners.clear();
  }
}

const live = new Map<string, JobLog>();

export function openLog(jobId: string): JobLog {
  const log = new JobLog(jobId);
  live.set(jobId, log);
  return log;
}

export function closeLog(jobId: string): void {
  live.get(jobId)?.close();
  live.delete(jobId);
}

export function liveLog(jobId: string): JobLog | null {
  return live.get(jobId) ?? null;
}

export function discardLog(jobId: string): void {
  closeLog(jobId);
  rmSync(paths.logFile(jobId), { force: true });
}

/**
 * The tail of a job's log, capped.
 *
 * Read with a positioned `read` rather than `readFileSync`, so the multi-hundred-megabyte log a
 * build stuck in a retry loop can produce is never pulled into memory whole.
 */
export function readTail(jobId: string, limit = config.logTailBytes): { text: string; truncated: boolean } {
  const path = paths.logFile(jobId);
  if (!existsSync(path)) return { text: "", truncated: false };

  const size = statSync(path).size;
  const from = Math.max(0, size - limit);
  const length = size - from;
  if (length === 0) return { text: "", truncated: from > 0 };
  const buffer = Buffer.allocUnsafe(length);

  const handle = openSync(path, "r");
  try {
    readSync(handle, buffer, 0, length, from);
  } finally {
    closeSync(handle);
  }
  return { text: buffer.toString("utf8"), truncated: from > 0 };
}
