import { headers } from "next/headers";

export const WORKER =
  process.env.REEL_WORKER_URL ??
  (process.env.NODE_ENV === "production" ? "http://worker:8500" : "http://localhost:8500");

export class WorkerUnreachable extends Error {
  constructor(readonly base: string, cause: unknown) {
    super(`Could not reach the worker at ${base}`, { cause });
  }
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const incoming = await headers();
  // The incoming Cookie header verbatim, rather than one rebuilt from Next's parsed jar: the
  // builder signs the value it issued, and a re-encoded copy is a different string to the HMAC.
  const cookie = incoming.get("cookie");
  // Forwarded so the worker knows whether the *browser* is on TLS, which is what decides the
  // Secure flag on any cookie it issues. Panel-to-builder is always plain HTTP on the internal
  // network, so without this every session cookie would come back without Secure.
  const proto = incoming.get("x-forwarded-proto");

  let response: Response;
  try {
    response = await fetch(`${WORKER}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init?.body ? { "content-type": "application/json" } : {}),
        ...(cookie ? { cookie } : {}),
        ...(proto ? { "x-forwarded-proto": proto } : {}),
        ...init?.headers,
      },
      cache: "no-store",
    });
  } catch (failure) {
    throw new WorkerUnreachable(WORKER, failure);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(response.status, body.error ?? `the worker answered ${response.status}`);
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export const api = {
  get: <T>(path: string) => call<T>(path),
  post: <T>(path: string, body?: unknown) =>
    call<T>(path, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => call<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  delete: <T>(path: string) => call<T>(path, { method: "DELETE" }),
  /** A jar, forwarded as raw bytes. `init.headers` is spread last in `call`, so this wins. */
  putBytes: <T>(path: string, body: Uint8Array, extra: Record<string, string> = {}) =>
    call<T>(path, {
      method: "PUT",
      body: body as BodyInit,
      headers: { "content-type": "application/java-archive", ...extra },
    }),
};

/** Null instead of a thrown 401/403, for a page that should render its signed-out state instead. */
export async function maybe<T>(path: string): Promise<T | null> {
  try {
    return await api.get<T>(path);
  } catch (failure) {
    if (failure instanceof ApiError && (failure.status === 401 || failure.status === 403)) return null;
    throw failure;
  }
}
