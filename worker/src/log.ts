type Level = "info" | "warn" | "error";

function emit(level: Level, message: string, detail?: unknown) {
  const line = `${new Date().toISOString()} ${level.padEnd(5)} ${message}`;
  const stream = level === "info" ? process.stdout : process.stderr;
  stream.write(detail === undefined ? `${line}\n` : `${line} ${describe(detail)}\n`);
}

function describe(detail: unknown): string {
  if (detail instanceof Error) return detail.stack ?? detail.message;
  if (typeof detail === "string") return detail;
  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export const log = {
  info: (message: string, detail?: unknown) => emit("info", message, detail),
  warn: (message: string, detail?: unknown) => emit("warn", message, detail),
  error: (message: string, detail?: unknown) => emit("error", message, detail),
};
