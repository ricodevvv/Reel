"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Keeps the page honest without polling it.
 *
 * Every page here renders on the server, so the browser does not need the change itself — only
 * that there was one. A build moving from queued to running to finished emits three of these in
 * quick succession, which is why they are coalesced rather than each triggering a refetch.
 */
export function Live() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const source = new EventSource("/live");

    const refresh = () => {
      if (pending.current) clearTimeout(pending.current);
      pending.current = setTimeout(() => router.refresh(), 400);
    };

    source.onopen = () => setConnected(true);
    source.onerror = () => setConnected(false);
    source.addEventListener("builds", refresh);
    source.addEventListener("projects", refresh);
    source.addEventListener("deployments", refresh);

    return () => {
      if (pending.current) clearTimeout(pending.current);
      source.close();
    };
  }, [router]);

  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={connected ? "Live updates on" : "Reconnecting"}
    >
      <span
        className={cn(
          "size-1.5 rounded-full bg-muted-foreground",
          connected && "bg-success shadow-[0_0_6px_var(--success)]",
        )}
      />
      {connected ? "live" : "offline"}
    </div>
  );
}
