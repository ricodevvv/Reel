import { headers } from "next/headers";
import { WORKER } from "@/lib/api";

/**
 * Passes a streaming response straight through from the worker.
 *
 * Next's `rewrites` could route these, but a route handler is what lets the panel set
 * `x-accel-buffering` and forward the cookie verbatim. Both matter: without the first, a reverse
 * proxy buffers the live log into one lump at the end, which defeats the point of streaming it.
 */
export async function relay(path: string, contentType: string): Promise<Response> {
  const cookie = (await headers()).get("cookie");

  let upstream: Response;
  try {
    upstream = await fetch(`${WORKER}${path}`, {
      headers: {
        accept: contentType,
        ...(cookie ? { cookie } : {}),
      },
      cache: "no-store",
    });
  } catch {
    return new Response("the worker is not reachable", { status: 502 });
  }

  if (!upstream.ok || !upstream.body) {
    return new Response("nothing to stream", { status: upstream.status || 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "content-type": upstream.headers.get("content-type") ?? contentType,
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
      ...(upstream.headers.get("content-disposition")
        ? { "content-disposition": upstream.headers.get("content-disposition")! }
        : {}),
      ...(upstream.headers.get("content-length")
        ? { "content-length": upstream.headers.get("content-length")! }
        : {}),
    },
  });
}
