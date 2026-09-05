import { createServer } from "node:http";
import { warnIfOpen } from "./auth.js";
import { config } from "./config.js";
import { Router } from "./http.js";
import { queue } from "./jobs/queue.js";
import { reapContainers } from "./jobs/runner.js";
import { log } from "./log.js";
import { prepareDataRoot } from "./paths.js";
import { authRoutes } from "./routes/auth.js";
import { jobRoutes } from "./routes/jobs.js";
import { spotifyRoutes } from "./routes/spotify.js";
import { systemRoutes } from "./routes/system.js";

async function main(): Promise<void> {
  prepareDataRoot();
  warnIfOpen();

  // Order matters for both: the records have to be honest about what is running before anything is
  // allowed to queue, and stale containers have to go before a new job reuses a name.
  queue.recoverInterrupted();
  await reapContainers();

  const router = new Router();
  systemRoutes(router);
  authRoutes(router);
  jobRoutes(router);
  spotifyRoutes(router);

  const server = createServer((req, res) => void router.handle(req, res));
  // A job log is held open for as long as the download runs, which is longer than Node's own
  // two-minute default would allow.
  server.requestTimeout = 0;
  server.headersTimeout = 60_000;

  server.listen(config.port, config.bind, () => {
    log.info(`reel worker listening on ${config.bind}:${config.port}`);
    log.info(`data root ${config.dataRoot}, up to ${config.maxConcurrentJobs} concurrent job(s)`);
  });

  const stop = (signal: string) => {
    log.info(`${signal}, shutting down`);
    // Jobs are left alone on purpose: recoverInterrupted marks them on the way back up, and killing
    // a download that is nearly finished because the panel was updated would be the worse trade.
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 5000).unref();
  };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
}

main().catch((failure) => {
  log.error("the worker could not start", failure);
  process.exit(1);
});
