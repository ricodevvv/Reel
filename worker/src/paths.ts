import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config.js";

const root = config.dataRoot;

/**
 * The data root's layout.
 *
 * Everything the panel can address resolves through here, so a traversal attempt in a path
 * parameter has nowhere to land: ids are validated by `isId` before they reach any of these, and
 * a downloaded file is addressed by its index in the job's record rather than by its name.
 */
export const paths = {
  root,
  jobs: join(root, "jobs"),
  /** Where a job's files land. Bind-mounted into the fetcher container as its output directory. */
  output: (jobId: string) => join(root, "output", jobId),
  logFile: (jobId: string) => join(root, "logs", `${jobId}.log`),
  /** Built on the first request for it, then kept beside the files it holds. */
  archive: (jobId: string) => join(root, "output", jobId, "..bundle.zip"),
};

export function prepareDataRoot(): void {
  for (const dir of [paths.jobs, join(root, "output"), join(root, "logs")]) {
    mkdirSync(dir, { recursive: true });
  }
}
