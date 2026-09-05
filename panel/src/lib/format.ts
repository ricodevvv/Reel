export function ago(millis: number | null | undefined): string {
  if (!millis) return "-";
  const elapsed = Date.now() - millis;
  if (elapsed < 60_000) return "just now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m ago`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h ago`;
  return `${Math.floor(elapsed / 86_400_000)}d ago`;
}

export function duration(from: number | null | undefined, to: number | null | undefined): string {
  if (!from || !to) return "-";
  return spell(Math.round((to - from) / 1000));
}

export function spell(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function bytes(count: number): string {
  if (count < 1024) return `${count} B`;
  if (count < 1024 * 1024) return `${(count / 1024).toFixed(1)} KB`;
  if (count < 1024 * 1024 * 1024) return `${(count / 1024 / 1024).toFixed(1)} MB`;
  return `${(count / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

/** The host and path of a URL, which is the part worth showing in a table. */
export function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, "");
  } catch {
    return url;
  }
}

/** Minutes and seconds, from the milliseconds Spotify reports. */
export function clock(millis: number): string {
  const seconds = Math.round(millis / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
