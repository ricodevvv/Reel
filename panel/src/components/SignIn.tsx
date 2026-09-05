"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { signIn, type Outcome } from "@/lib/actions";

export function SignIn() {
  const [outcome, run, busy] = useActionState<Outcome | null, FormData>(
    async (_previous, form) => signIn(form),
    null,
  );

  return (
    <div className="grid min-h-svh place-items-center bg-background px-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-4 text-center">
        <div className="text-2xl font-semibold tracking-tight">
          reel<span className="text-muted-foreground">.euronic</span>
        </div>
        <p className="text-sm text-muted-foreground">One password, and it is yours.</p>

        <form action={run} className="w-full space-y-2">
          <Input
            name="password"
            type="password"
            placeholder="Password"
            autoComplete="current-password"
            autoFocus
            required
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Checking..." : "Sign in"}
          </Button>
        </form>

        {outcome && !outcome.ok && <p className="text-sm text-destructive">{outcome.error}</p>}
      </div>
    </div>
  );
}
