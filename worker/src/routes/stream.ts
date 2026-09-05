import type { IncomingMessage, ServerResponse } from "node:http";

export type Stream = {
  /** One event. The payload is JSON-encoded, so a multi-line log chunk stays on one `data:` line. */
  send: (event: string, data: unknown) => void;
  close: () => void;
  onClose: (handler: () => void) => void;
};

/** Long enough to be idle-friendly, short enough that no reverse proxy's default timeout beats it. */
const HEARTBEAT_MS = 20_000;

/**
 * Opens a server-sent event stream.
 *
 * `x-accel-buffering: no` is the one header that is not obvious and is not optional: without it
 * nginx holds the response in its own buffer, and a live log arrives in one lump at the end,
 * which is exactly the thing this is for.
 */
export function openStream(req: IncomingMessage, res: ServerResponse): Stream {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    "x-accel-buffering": "no",
  });
  res.flushHeaders?.();

  let open = true;
  const handlers: (() => void)[] = [];

  const heartbeat = setInterval(() => {
    if (open) res.write(": ping\n\n");
  }, HEARTBEAT_MS);

  const finish = () => {
    if (!open) return;
    open = false;
    clearInterval(heartbeat);
    for (const handler of handlers) handler();
  };

  req.on("close", finish);
  res.on("close", finish);

  return {
    send(event, data) {
      if (!open) return;
      // A payload's own newlines would each start a new SSE field, so everything is encoded on the
      // way out and the browser does one JSON.parse on the way in.
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    close() {
      if (!open) return;
      finish();
      res.end();
    },
    onClose(handler) {
      handlers.push(handler);
    },
  };
}
