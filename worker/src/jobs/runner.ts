import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { config } from "../config.js";
import { log as sys } from "../log.js";
import type { Downloaded, Job } from "../model.js";
import { paths } from "../paths.js";
import { closeLog, openLog } from "./logs.js";
import { capture, run } from "./process.js";

export type Outcome = {
  status: "success" | "failed" | "cancelled";
  error: string | null;
};

/** Handed to the queue so a job in flight can be stopped from the panel. */
export type Running = { cancel: () => void };

function containerName(jobId: string): string {
  return `reel-job-${jobId}`;
}

/** The file the archive lands in, which is not itself one of the downloads. */
const ARCHIVE = "..bundle.zip";

/**
 * What the source turns out to be, without fetching any of it.
 *
 * `--flat-playlist` stops at the index, so this costs one request even for a playlist of hundreds
 * — which is what makes it safe to do before deciding whether the job is allowed to run at all.
 */
type Probe = { title: string; items: number; playlist: boolean };

async function probe(url: string): Promise<Probe | { error: string }> {
  const result = await capture(
    config.docker,
    [
      "run",
      "--rm",
      "--network",
      "bridge",
      "--security-opt",
      "no-new-privileges:true",
      config.fetcherImage,
      "yt-dlp",
      "--dump-single-json",
      "--flat-playlist",
      "--no-warnings",
      "--",
      url,
    ],
    { timeoutMs: 120_000 },
  );

  if (result.timedOut) return { error: "The source did not answer in time." };
  if (result.code !== 0) {
    // yt-dlp's own complaint is the useful one — "Video unavailable", "Private video", "Unsupported
    // URL" — and far better than anything this could say instead.
    const said = result.stderr.split("\n").filter(Boolean).pop() ?? "";
    return { error: said.replace(/^ERROR:\s*/, "") || "yt-dlp could not read that URL." };
  }

  try {
    const info = JSON.parse(result.stdout) as { _type?: string; title?: string; entries?: unknown[] };
    const playlist = info._type === "playlist";
    return {
      title: typeof info.title === "string" ? info.title : "untitled",
      items: playlist ? (info.entries?.length ?? 0) : 1,
      playlist,
    };
  } catch {
    return { error: "yt-dlp answered with something this could not read." };
  }
}

/** The format selection, as yt-dlp arguments. */
function formatArgs(job: Job): string[] {
  if (job.format === "audio-m4a") return ["-x", "--audio-format", "m4a"];
  if (job.format === "audio-mp3") return ["-x", "--audio-format", "mp3", "--audio-quality", "0"];

  // Best video and best audio muxed into mp4, falling back to whatever single file exists — the
  // fallback chain matters because plenty of sources offer no separate streams at all.
  const cap = job.maxHeight > 0 ? `[height<=${job.maxHeight}]` : "";
  return ["-f", `bv*${cap}+ba/b${cap}/bv*+ba/b`, "--merge-output-format", "mp4"];
}

function dockerArgs(job: Job, probed: Probe, output: string): string[] {
  // A playlist's files are numbered so they sort the way the playlist reads. A single video does
  // not need a number in front of its name.
  const template = probed.playlist ? "%(playlist_index)03d - %(title)s.%(ext)s" : "%(title)s.%(ext)s";

  return [
    "run",
    "--rm",
    "--name",
    containerName(job.id),
    "--network",
    "bridge",
    "--security-opt",
    "no-new-privileges:true",
    "--memory",
    config.jobMemory,
    // The output directory lives on the host at exactly this path, which is why REEL_DATA_ROOT has
    // to be identical inside this container and outside it. See config.dataRoot.
    "-v",
    `${output}:/out`,
    "-w",
    "/out",
    config.fetcherImage,
    "yt-dlp",
    // One line per progress update instead of a redrawn bar, which is the difference between a
    // readable log and a wall of carriage returns.
    "--newline",
    "--no-color",
    // The URL decides, not yt-dlp's guess: a video link that happens to carry a list parameter is
    // one video here, because that is what was pasted.
    probed.playlist ? "--yes-playlist" : "--no-playlist",
    "--embed-metadata",
    "--no-overwrites",
    "-o",
    template,
    ...formatArgs(job),
    "--",
    job.url,
  ];
}

/** `[download]  42.3% of ...`, which is the only progress yt-dlp reports in a parseable shape. */
const PERCENT = /^\[download\]\s+(\d{1,3}(?:\.\d+)?)%/;
/** `[download] Downloading item 3 of 10` — how far through a playlist the run is. */
const ITEM = /^\[download\] Downloading item (\d+) of (\d+)/;

/**
 * Turns yt-dlp's chatter into one number.
 *
 * Best effort by nature: a source that never reports a total leaves the percentage at whatever it
 * last was, which is honest — the panel shows a bar that stops moving rather than a lie.
 */
function watchProgress(job: Job, total: number, onChange: () => void) {
  let done = 0;

  return (chunk: string) => {
    for (const line of chunk.split("\n")) {
      const item = ITEM.exec(line);
      if (item) {
        done = Number(item[1]) - 1;
        continue;
      }
      const percent = PERCENT.exec(line);
      if (!percent) continue;

      const fraction = Number(percent[1]) / 100;
      const overall = total > 1 ? (done + fraction) / total : fraction;
      const rounded = Math.min(100, Math.max(0, Math.round(overall * 100)));
      if (rounded !== job.progress) {
        job.progress = rounded;
        onChange();
      }
    }
  };
}

/** Everything the fetcher left behind, which is what the job is for. */
function collect(output: string): Downloaded[] {
  if (!existsSync(output)) return [];
  return readdirSync(output)
    .filter((name) => name !== ARCHIVE && !name.endsWith(".part") && !name.endsWith(".ytdl"))
    .map((name) => ({ name, size: statSync(join(output, name)).size }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

export async function execute(
  job: Job,
  running: (handle: Running) => void,
  save: () => void,
): Promise<Outcome> {
  const out = openLog(job.id);
  const output = paths.output(job.id);
  let cancelled = false;

  try {
    rmSync(output, { recursive: true, force: true });
    mkdirSync(output, { recursive: true });

    out.write(`Euronic Reel\nurl     ${job.url}\nformat  ${job.format}\n`);

    out.say("reading the source");
    const probed = await probe(job.url);
    if ("error" in probed) {
      out.say(probed.error);
      return { status: "failed", error: probed.error };
    }

    job.title = probed.title;
    save();
    out.write(`title   ${probed.title}\nitems   ${probed.items}\n`);

    if (probed.items > config.maxItems) {
      const error = `That is ${probed.items} items, and the limit is ${config.maxItems}.`;
      out.say(error);
      return { status: "failed", error };
    }

    out.say("fetching");
    const name = containerName(job.id);
    const timeout = setTimeout(() => {
      out.say(`over the ${config.jobTimeoutSeconds}s limit, stopping`);
      void stopContainer(name);
    }, config.jobTimeoutSeconds * 1000);

    running({
      cancel: () => {
        cancelled = true;
        out.say("cancelled");
        void stopContainer(name);
      },
    });

    const result = await run(config.docker, dockerArgs(job, probed, output), {
      log: out,
      onOutput: watchProgress(job, probed.items, save),
    });
    clearTimeout(timeout);

    job.files = collect(output);
    save();

    if (cancelled) return { status: "cancelled", error: null };
    if (result.code !== 0 && job.files.length === 0) {
      out.say(`yt-dlp exited ${result.code}`);
      return { status: "failed", error: "yt-dlp could not fetch that. The log says why." };
    }
    if (job.files.length === 0) {
      return { status: "failed", error: "yt-dlp finished but left no files." };
    }

    job.progress = 100;
    out.say(`kept ${job.files.length} file(s)`);
    for (const file of job.files) out.write(`  ${file.name}\n`);

    // A run that lost some of a playlist still produced the rest, and saying so is more useful
    // than either calling it a success or throwing the files away.
    if (result.code !== 0) {
      out.say("some items failed; the ones that worked are below");
      return { status: "success", error: `Some items could not be fetched (yt-dlp exited ${result.code}).` };
    }
    return { status: "success", error: null };
  } catch (failure) {
    sys.error(`job ${job.id} threw`, failure);
    out.say(`the worker itself failed: ${failure instanceof Error ? failure.message : String(failure)}`);
    return { status: "failed", error: "The worker failed before the job could finish." };
  } finally {
    closeLog(job.id);
  }
}

async function stopContainer(name: string): Promise<void> {
  await capture(config.docker, ["rm", "--force", name]);
}

/** Tears down anything this worker left behind, so a restart does not leak containers. */
export async function reapContainers(): Promise<void> {
  const listed = await capture(config.docker, ["ps", "--all", "--quiet", "--filter", "name=^reel-job-"]);
  const ids = listed.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
  if (ids.length === 0) return;
  sys.warn(`removing ${ids.length} container(s) left over from a previous run`);
  await capture(config.docker, ["rm", "--force", ...ids]);
}

