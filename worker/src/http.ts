import type { IncomingMessage, ServerResponse } from "node:http";
import { authorized } from "./auth.js";
import { log } from "./log.js";

export type Ctx = {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  params: Record<string, string>;
};

export type Handler = (ctx: Ctx) => void | Promise<void>;

/** Thrown by a handler to answer with a status and a message instead of a 500. */
export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

export const bad = (message: string) => new HttpError(400, message);
export const missing = (message = "not found") => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": String(payload.length),
    "cache-control": "no-store",
  });
  res.end(payload);
}

export function noContent(res: ServerResponse): void {
  res.writeHead(204, { "cache-control": "no-store" });
  res.end();
}

export async function readBody(req: IncomingMessage, limit: number): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    total += (chunk as Buffer).length;
    // Checked as it streams rather than from content-length, which a client controls and can lie about.
    if (total > limit) throw bad(`body larger than ${limit} bytes`);
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks);
}

export async function readJson<T>(req: IncomingMessage, limit = 1 << 20): Promise<T> {
  const body = await readBody(req, limit);
  if (body.length === 0) return {} as T;
  try {
    return JSON.parse(body.toString("utf8")) as T;
  } catch {
    throw bad("body is not valid json");
  }
}

type Route = {
  method: string;
  segments: string[];
  handler: Handler;
  open: boolean;
};

export class Router {
  private readonly routes: Route[] = [];

  /** `open` routes skip the session check: health, and login itself. */
  add(method: string, pattern: string, handler: Handler, open = false): this {
    this.routes.push({ method, segments: pattern.split("/").filter(Boolean), handler, open });
    return this;
  }

  get = (pattern: string, handler: Handler, open = false) => this.add("GET", pattern, handler, open);
  post = (pattern: string, handler: Handler, open = false) => this.add("POST", pattern, handler, open);
  put = (pattern: string, handler: Handler, open = false) => this.add("PUT", pattern, handler, open);
  patch = (pattern: string, handler: Handler, open = false) => this.add("PATCH", pattern, handler, open);
  delete = (pattern: string, handler: Handler, open = false) => this.add("DELETE", pattern, handler, open);

  private match(method: string, segments: string[]): { route: Route; params: Record<string, string> } | null {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (route.segments.length !== segments.length) continue;
      const params: Record<string, string> = {};
      let ok = true;
      for (let index = 0; index < route.segments.length; index++) {
        const expected = route.segments[index]!;
        const actual = segments[index]!;
        if (expected.startsWith(":")) params[expected.slice(1)] = decodeURIComponent(actual);
        else if (expected !== actual) {
          ok = false;
          break;
        }
      }
      if (ok) return { route, params };
    }
    return null;
  }

  async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://forge");
    const segments = url.pathname.split("/").filter(Boolean);
    const found = this.match(req.method ?? "GET", segments);

    if (!found) return json(res, 404, { error: "not_found" });
    if (!found.route.open && !authorized({ cookie: req.headers.cookie, authorization: req.headers.authorization })) {
      return json(res, 401, { error: "unauthorized" });
    }

    try {
      await found.route.handler({ req, res, url, params: found.params });
    } catch (failure) {
      if (failure instanceof HttpError) {
        if (!res.headersSent) json(res, failure.status, { error: failure.message });
        return;
      }
      log.error(`${req.method} ${url.pathname} failed`, failure);
      if (!res.headersSent) json(res, 500, { error: "internal_error" });
      else res.end();
    }
  }
}
