"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * A terminal box fed by server-sent events.
 *
 * Shared by the build log and a container's log, because the hard parts are the same for both:
 * chunks arrive faster than a browser can usefully repaint, following has to yield the moment the
 * reader scrolls up, and a stream that ends should say so rather than just stop.
 */
export function LogStream({
  source,
  empty,
  header,
  onEnd,
}: {
  /** SSE endpoint sending `log` events, and optionally an `end` event. */
  source: string;
  /** Shown until the first chunk arrives. */
  empty: string;
  /** Rendered on the left of the toolbar: a status badge, a picker, whatever the caller needs. */
  header?: React.ReactNode;
  onEnd?: (payload: unknown) => void;
}) {
  const [text, setText] = useState("");
  const [follow, setFollow] = useState(true);
  const [copied, setCopied] = useState(false);

  const box = useRef<HTMLPreElement>(null);
  const pending = useRef<string[]>([]);
  const followRef = useRef(follow);
  followRef.current = follow;
  const ended = useRef(onEnd);
  ended.current = onEnd;

  useEffect(() => {
    // A new source is a different log. Starting from the old one's text would be a lie.
    setText("");
    pending.current = [];

    const events = new EventSource(source);

    // Buffered and flushed on a timer: a Gradle configuration phase or a server start emits lines
    // faster than a repaint, and rendering each one separately locks up the tab.
    const flush = setInterval(() => {
      if (pending.current.length === 0) return;
      const chunk = pending.current.join("");
      pending.current = [];
      setText((current) => current + chunk);
    }, 120);

    events.addEventListener("log", (event) => {
      pending.current.push(JSON.parse((event as MessageEvent<string>).data) as string);
    });
    events.addEventListener("end", (event) => {
      events.close();
      ended.current?.(JSON.parse((event as MessageEvent<string>).data));
    });

    return () => {
      clearInterval(flush);
      events.close();
    };
  }, [source]);

  useEffect(() => {
    if (followRef.current && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [text]);

  // Following means "stick to the bottom", so it turns itself off the moment the reader scrolls up
  // to look at something, and back on when they scroll back down.
  const onScroll = useCallback(() => {
    const element = box.current;
    if (!element) return;
    setFollow(element.scrollHeight - element.scrollTop - element.clientHeight < 40);
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        {header}
        <div className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setFollow((on) => !on)}
          className={cn(!follow && "text-muted-foreground")}
        >
          <ArrowDownToLine className={cn("size-3.5", follow && "text-success")} />
          {follow ? "following" : "follow"}
        </Button>
        <Button variant="ghost" size="sm" onClick={copy} disabled={!text}>
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          copy
        </Button>
      </div>

      <pre
        ref={box}
        onScroll={onScroll}
        className="max-h-[70vh] min-h-64 overflow-auto bg-muted/30 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap"
      >
        {text || empty}
      </pre>
    </div>
  );
}
