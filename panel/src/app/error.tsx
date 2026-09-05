"use client";

import { Button } from "@/components/ui/button";

export default function Broken({ error, reset }: { error: Error; reset: () => void }) {
  const unreachable = error.message.includes("Could not reach the worker");

  return (
    <div className="grid min-h-svh place-items-center bg-background px-6">
      <div className="max-w-lg space-y-3 text-left">
        <div className="text-2xl font-semibold tracking-tight">
          reel<span className="text-muted-foreground">.euronic</span>
        </div>
        {unreachable ? (
          <>
            <h1 className="text-xl font-semibold tracking-tight">The worker is not answering</h1>
            <p className="text-sm text-muted-foreground">{error.message}</p>
            <p className="text-sm text-muted-foreground">
              Point the panel at it with <code className="font-mono text-xs">REEL_WORKER_URL</code>. Under
              the compose file that is <code className="font-mono text-xs">http://worker:8500</code>, and{" "}
              <code className="font-mono text-xs">docker compose logs worker</code> says why it is down.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold tracking-tight">Something broke</h1>
            <p className="text-sm text-muted-foreground">{error.message}</p>
          </>
        )}
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
