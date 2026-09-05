import { Collection } from "./store.js";
import type { Job } from "./model.js";
import { paths } from "./paths.js";

/**
 * Everything this process remembers.
 *
 * One JSON file per job, loaded once at boot and written through on every change. At the scale a
 * self-hosted downloader runs at that buys a service with no database to install, and a history
 * an operator can read with `cat`.
 */
export const store = {
  jobs: new Collection<Job>(paths.jobs),
};

/** Newest first, which is the order every list in the panel wants. */
export function jobsNewestFirst(filter?: (job: Job) => boolean): Job[] {
  return store.jobs
    .all()
    .filter((job) => filter?.(job) ?? true)
    .sort((a, b) => b.queuedAt - a.queuedAt);
}
