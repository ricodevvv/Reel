import { createReadStream, existsSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { archiveName, archiveOf } from "../jobs/archive.js";
import { discardLog, liveLog, readTail } from "../jobs/logs.js";
import { queue } from "../jobs/queue.js";
import { bad, conflict, json, missing, noContent, readJson, type Ctx, type Router } from "../http.js";
import { identify } from "../auth.js";
import { isId, newId } from "../ids.js";
import { isTerminal, type Job } from "../model.js";
import { paths } from "../paths.js";
import { jobsNewestFirst, store } from "../state.js";
import * as check from "../validate.js";
import { openStream } from "./stream.js";

function find(id: string): Job {
  if (!isId(id)) throw missing("no job by that id");
  const job = store.jobs.get(id);
  if (!job) throw missing("no job by that id");
  return job;
}

function limitOf(ctx: Ctx, fallback: number): number {
  const raw = Number(ctx.url.searchParams.get("limit"));
  return Number.isFinite(raw) && raw > 0 ? Math.min(Math.floor(raw), 500) : fallback;
}

/**
 * A filename a browser will save correctly, whatever is in it.
 *
 * Two forms, because they are read by different browsers: a plain ASCII fallback with everything
 * awkward stripped, and the RFC 5987 form that carries the real name including its accents.
 */
function disposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

function serve(ctx: Ctx, path: string, name: string, type: string): void {
  ctx.res.writeHead(200, {
    "content-type": type,
    "content-length": String(statSync(path).size),
    "content-disposition": disposition(name),
    "cache-control": "no-store",
  });
  createReadStream(path).pipe(ctx.res);
}

const TYPES: Record<string, string> = {
  mp4: "video/mp4",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4a: "audio/mp4",
  mp3: "audio/mpeg",
  opus: "audio/opus",
};

export function jobRoutes(router: Router): void {
  router.get("/api/jobs", (ctx) => json(ctx.res, 200, jobsNewestFirst().slice(0, limitOf(ctx, 100))));

  router.get("/api/jobs/:id", ({ res, params }) => json(res, 200, find(params.id!)));

  router.post("/api/jobs", async ({ req, res }) => {
    const body = await readJson<Record<string, unknown>>(req, 8192);

    const job = store.jobs.put({
      id: newId(),
      url: check.mediaUrl(body.url),
      format: check.format(body.format),
      maxHeight: check.maxHeight(body.maxHeight),
      status: "queued",
      trigger: identify(req.headers) ?? "api",
      title: "",
      files: [],
      progress: 0,
      error: null,
      pruned: false,
      queuedAt: Date.now(),
      startedAt: null,
      finishedAt: null,
    });

    queue.enqueue(job);
    return json(res, 202, job);
  });

  router.post("/api/jobs/:id/cancel", ({ res, params }) => {
    const job = find(params.id!);
    if (isTerminal(job.status)) throw conflict("That job has already finished");
    if (!queue.cancel(job.id)) throw conflict("That job is no longer cancellable");
    return json(res, 202, { ok: true });
  });

  router.delete("/api/jobs/:id", ({ res, params }) => {
    const job = find(params.id!);
    if (!isTerminal(job.status)) throw conflict("That job is still running");
    discardLog(job.id);
    rmSync(paths.output(job.id), { recursive: true, force: true });
    store.jobs.remove(job.id);
    return noContent(res);
  });

  // ---- the log ------------------------------------------------------------------------------

  router.get("/api/jobs/:id/log", ({ res, params }) => {
    const job = find(params.id!);
    const { text, truncated } = readTail(job.id);
    return json(res, 200, { status: job.status, pruned: job.pruned, text, truncated });
  });

  /**
   * The live log.
   *
   * The file so far, then every chunk as it is written, then an `end` event. A viewer that opens
   * this mid-download and one that opens it afterwards both see the same complete log, which is
   * what lets the panel use one component for both.
   */
  router.get("/api/jobs/:id/log/stream", ({ res, params, req }) => {
    const job = find(params.id!);
    const stream = openStream(req, res);

    const { text, truncated } = readTail(job.id);
    if (truncated) stream.send("log", ">>> (showing the tail of a very long log)\n");
    if (text) stream.send("log", text);

    const live = liveLog(job.id);
    if (!live || isTerminal(job.status)) {
      stream.send("end", { status: job.status });
      return stream.close();
    }

    const unsubscribe = live.subscribe((chunk) => stream.send("log", chunk));
    // The record is what says a job is over: the queue writes it before the log is closed.
    const poll = setInterval(() => {
      const current = store.jobs.get(job.id);
      if (!current || !isTerminal(current.status)) return;
      stream.send("end", { status: current.status });
      stream.close();
    }, 1000);

    stream.onClose(() => {
      unsubscribe();
      clearInterval(poll);
    });
  });

  // ---- what came out ------------------------------------------------------------------------

  /**
   * One file, addressed by its position in the job's record rather than by its name.
   *
   * yt-dlp names a file after the title it found, which can be anything at all. Indexing sidesteps
   * every question about what such a name might mean to a filesystem, and the real name still
   * reaches the browser in the Content-Disposition.
   */
  router.get("/api/jobs/:id/files/:index", (ctx) => {
    const job = find(ctx.params.id!);
    const file = job.files[Number(ctx.params.index)];
    if (!file) throw missing("no file at that index");

    const path = join(paths.output(job.id), file.name);
    if (!existsSync(path)) throw missing("that file is no longer on disk");

    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    serve(ctx, path, file.name, TYPES[extension] ?? "application/octet-stream");
  });

  /** Everything the job produced, as one zip. Built on the first request and kept afterwards. */
  router.get("/api/jobs/:id/archive", async (ctx) => {
    const job = find(ctx.params.id!);
    const result = await archiveOf(job);
    if ("error" in result) throw bad(result.error);
    serve(ctx, result.path, archiveName(job), "application/zip");
  });
}
