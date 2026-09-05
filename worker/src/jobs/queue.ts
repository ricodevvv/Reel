import { rmSync } from "node:fs";
import { config } from "../config.js";
import { events } from "../events.js";
import { log as sys } from "../log.js";
import type { Job } from "../model.js";
import { paths } from "../paths.js";
import { store, jobsNewestFirst } from "../state.js";
import { discardLog } from "./logs.js";
import { execute, type Running } from "./runner.js";

/**
 * Decides what downloads when.
 *
 * A couple at a time by default: these jobs are bound by the source's upload speed rather than by
 * this machine, so a small amount of concurrency helps and a large amount only shares the same
 * pipe out more thinly. Queued jobs are ordinary records with an ordinary status, which is what
 * lets the panel show a queue and what lets one be cancelled before it ever starts.
 */
class JobQueue {
  private readonly waiting: string[] = [];
  private readonly running = new Map<string, Running>();

  enqueue(job: Job): void {
    this.waiting.push(job.id);
    events.emit("jobs");
    this.pump();
  }

  get busy(): number {
    return this.running.size;
  }

  get queued(): number {
    return this.waiting.length;
  }

  /**
   * Stops a job, whether it has started or not.
   *
   * A queued job is simply marked and dropped from the queue; a running one has its container torn
   * down, and `execute` notices and reports the cancellation itself.
   */
  cancel(jobId: string): boolean {
    const handle = this.running.get(jobId);
    if (handle) {
      handle.cancel();
      return true;
    }

    const index = this.waiting.indexOf(jobId);
    if (index < 0) return false;
    this.waiting.splice(index, 1);

    const job = store.jobs.get(jobId);
    if (job) {
      job.status = "cancelled";
      job.finishedAt = Date.now();
      store.jobs.put(job);
    }
    events.emit("jobs");
    return true;
  }

  private pump(): void {
    while (this.running.size < config.maxConcurrentJobs && this.waiting.length > 0) {
      const id = this.waiting.shift()!;
      const job = store.jobs.get(id);
      if (!job) continue;
      void this.start(job);
    }
  }

  private async start(job: Job): Promise<void> {
    // Registered before the first await, so a cancel arriving in the same tick is not lost.
    this.running.set(job.id, { cancel: () => {} });

    job.status = "running";
    job.startedAt = Date.now();
    store.jobs.put(job);
    events.emit("jobs");

    try {
      const outcome = await execute(
        job,
        (handle) => this.running.set(job.id, handle),
        () => store.jobs.put(job),
      );
      job.status = outcome.status;
      job.error = outcome.error;
    } catch (failure) {
      sys.error(`job ${job.id} escaped the runner`, failure);
      job.status = "failed";
      job.error = "The worker failed unexpectedly.";
    } finally {
      job.finishedAt = Date.now();
      store.jobs.put(job);
      this.running.delete(job.id);
      prune();
      events.emit("jobs");
      this.pump();
    }
  }

  /**
   * Marks jobs that were mid-flight when this process died.
   *
   * Their containers are gone with the restart, so leaving them as "running" would show a download
   * that can never finish and can never be cancelled.
   */
  recoverInterrupted(): void {
    for (const job of store.jobs.all()) {
      if (job.status !== "running" && job.status !== "queued") continue;
      job.status = "failed";
      job.error = "The worker restarted while this was running.";
      job.finishedAt = Date.now();
      store.jobs.put(job);
      sys.warn(`job ${job.id} was interrupted by a restart`);
    }
  }
}

/**
 * Keeps the history to the configured length.
 *
 * Media is what takes up room, not the records, so the oldest jobs keep their row and lose their
 * contents. A download an operator can still see happened is more useful than a gap — and a disk
 * that fills up silently is how a self-hosted tool stops working.
 */
function prune(): void {
  for (const job of jobsNewestFirst().slice(config.jobRetention)) {
    if (job.pruned) continue;
    discardLog(job.id);
    rmSync(paths.output(job.id), { recursive: true, force: true });
    job.pruned = true;
    job.files = [];
    store.jobs.put(job);
  }
}

export const queue = new JobQueue();
