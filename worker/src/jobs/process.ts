import { spawn } from "node:child_process";
import type { JobLog } from "./logs.js";

export type RunResult = {
  code: number | null;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
};

export type RunOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  log: JobLog;
  timeoutMs?: number;
  /** Called once the child exists, so a job can be cancelled while it runs. */
  onStart?: (kill: () => void) => void;
  /** Every chunk, before it reaches the log. For reading progress out of the output as it goes. */
  onOutput?: (chunk: string) => void;
};

/**
 * Runs a command, streaming both its streams into the job log as they arrive.
 *
 * Streaming rather than buffering is the whole point: an operator watching a 20-minute Gradle
 * build wants the line that is printing now, not a transcript once it is over.
 */
export function run(command: string, args: string[], options: RunOptions): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : null;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    const take = (chunk: string) => {
      options.onOutput?.(chunk);
      options.log.write(chunk);
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);

    options.onStart?.(() => child.kill("SIGKILL"));

    child.on("error", (failure) => {
      if (timer) clearTimeout(timer);
      options.log.say(`could not start ${command}: ${failure.message}`);
      resolve({ code: 127, signal: null, timedOut });
    });

    child.on("close", (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, timedOut });
    });
  });
}

/**
 * Runs a command for its output rather than its log. Used for the short git and docker queries
 * whose answer is data — a commit sha, a list of branches — and whose noise has no place in a log.
 *
 * A timeout matters here in a way it does not for a job: `git ls-remote` against a host that
 * accepts the connection and then says nothing will otherwise hang this request forever.
 */
export function capture(
  command: string,
  args: string[],
  options: { cwd?: string; env?: NodeJS.ProcessEnv; timeoutMs?: number } = {},
): Promise<{ code: number; stdout: string; stderr: string; timedOut: boolean }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGKILL");
        }, options.timeoutMs)
      : null;
    const done = (result: { code: number; stdout: string; stderr: string }) => {
      if (timer) clearTimeout(timer);
      resolve({ ...result, timedOut });
    };

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", (failure) => done({ code: 127, stdout, stderr: failure.message }));
    child.on("close", (code) => done({ code: code ?? 1, stdout, stderr }));
  });
}
