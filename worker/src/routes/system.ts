import { statfsSync } from "node:fs";
import { capture } from "../jobs/process.js";
import { queue } from "../jobs/queue.js";
import { config } from "../config.js";
import { events } from "../events.js";
import { json, type Router } from "../http.js";
import { paths } from "../paths.js";
import { configured } from "../spotify.js";
import { store } from "../state.js";
import { openStream } from "./stream.js";

/**
 * Whether the Docker socket is usable, and which yt-dlp is in the image, cached briefly.
 *
 * The overview asks on every render, and shelling out for each one would make an idle panel spawn
 * a process a second. A few seconds of staleness costs nothing here.
 */
let cached: { checked: number; docker: string | null; ytDlp: string | null } = {
  checked: 0,
  docker: null,
  ytDlp: null,
};

async function probeTools(): Promise<{ docker: string | null; ytDlp: string | null }> {
  if (Date.now() - cached.checked < 30_000) return cached;

  const docker = await capture(config.docker, ["version", "--format", "{{.Server.Version}}"], { timeoutMs: 10_000 });
  const version = await capture(
    config.docker,
    ["run", "--rm", config.fetcherImage, "yt-dlp", "--version"],
    { timeoutMs: 30_000 },
  );

  cached = {
    checked: Date.now(),
    docker: docker.code === 0 ? docker.stdout.trim() : null,
    ytDlp: version.code === 0 ? version.stdout.trim() : null,
  };
  return cached;
}

function disk(): { free: number; total: number } | null {
  try {
    const stats = statfsSync(paths.root);
    return { free: stats.bavail * stats.bsize, total: stats.blocks * stats.bsize };
  } catch {
    return null;
  }
}

export function systemRoutes(router: Router): void {
  router.get("/health", ({ res }) => json(res, 200, { ok: true }), true);

  router.get("/api/system", async ({ res }) => {
    const tools = await probeTools();
    return json(res, 200, {
      ...tools,
      spotify: configured(),
      dataRoot: paths.root,
      disk: disk(),
      jobs: store.jobs.size,
      running: queue.busy,
      queued: queue.queued,
      maxConcurrentJobs: config.maxConcurrentJobs,
      maxItems: config.maxItems,
      jobRetention: config.jobRetention,
    });
  });

  /**
   * The panel's nudge channel.
   *
   * Pages render on the server, so a browser holding this open just needs to know when to ask for
   * them again. See the Live component in the panel for the other half.
   */
  router.get("/api/events", ({ req, res }) => {
    const stream = openStream(req, res);
    stream.send("hello", { ok: true });
    const unsubscribe = events.subscribe((name) => stream.send(name, { at: Date.now() }));
    stream.onClose(unsubscribe);
  });
}
