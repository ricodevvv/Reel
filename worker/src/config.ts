import { randomBytes } from "node:crypto";

function text(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === "" ? fallback : value;
}

function count(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}

export const config = {
  bind: text("REEL_BIND", "0.0.0.0"),
  port: count("REEL_PORT", 8500),

  /**
   * The one path that has to mean the same thing in two places.
   *
   * This process runs in a container, but it does not run Docker: it talks to the host's daemon
   * over the mounted socket, and every `-v` it passes is resolved by that daemon against the
   * *host* filesystem. A download directory at some container-only path would mount as an empty
   * directory in the yt-dlp container. So deploy.sh bind-mounts the data directory at the
   * identical path inside this container, and every path derived from here is valid on both sides.
   */
  dataRoot: text("REEL_DATA_ROOT", "/opt/euronic-reel/data"),

  /** Signs session cookies. Regenerated per boot when unset, which just means logins do not survive a restart. */
  sessionSecret: text("REEL_SESSION_SECRET", randomBytes(32).toString("hex")),
  sessionHours: count("REEL_SESSION_HOURS", 24 * 14),

  /** scrypt hash produced by `deploy.sh password`; takes precedence over REEL_PASSWORD. */
  passwordHash: text("REEL_PASSWORD_HASH", ""),
  password: text("REEL_PASSWORD", ""),

  /** Optional bearer token, so a script can queue a download without a browser session. */
  apiToken: text("REEL_API_TOKEN", ""),

  docker: text("REEL_DOCKER", "docker"),
  /** The image holding yt-dlp and ffmpeg. Built and refreshed by deploy.sh. */
  fetcherImage: text("REEL_FETCHER_IMAGE", "euronic/reel-fetcher:local"),

  maxConcurrentJobs: count("REEL_MAX_CONCURRENT_JOBS", 2),
  jobTimeoutSeconds: count("REEL_JOB_TIMEOUT_SECONDS", 60 * 60),
  jobMemory: text("REEL_JOB_MEMORY", "1g"),
  /** A playlist of a thousand items is nobody's intention, and it fills a disk. */
  maxItems: count("REEL_MAX_ITEMS", 50),
  /** Jobs kept with their files. Older ones keep their row and lose their contents. */
  jobRetention: count("REEL_JOB_RETENTION", 50),

  /** Cap on what a log viewer is handed up front. */
  logTailBytes: count("REEL_LOG_TAIL_BYTES", 512 * 1024),

  /**
   * Spotify application credentials, for reading a public playlist's track list.
   *
   * Client credentials only, which is all this needs: it reads what a playlist contains, never
   * anything belonging to a person.
   */
  spotify: {
    clientId: text("REEL_SPOTIFY_CLIENT_ID", ""),
    clientSecret: text("REEL_SPOTIFY_CLIENT_SECRET", ""),
  },
} as const;
