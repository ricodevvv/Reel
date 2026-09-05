"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy } from "lucide-react";
import type { Outcome } from "@/lib/actions";

type Action = (form: FormData) => Promise<Outcome>;

function useOutcomeToast(outcome: Outcome | null, silent?: boolean) {
  const last = useRef<Outcome | null>(null);
  useEffect(() => {
    if (!outcome || outcome === last.current) return;
    last.current = outcome;
    if (!outcome.ok) toast.error(outcome.error);
    else if (outcome.note && !silent) toast.success(outcome.note);
  }, [outcome, silent]);
}

export function Form({
  action,
  submit,
  children,
  reveal,
}: {
  action: Action;
  submit: string;
  children: React.ReactNode;
  reveal?: boolean;
}) {
  const [outcome, run, busy] = useActionState<Outcome | null, FormData>(
    async (_previous, form) => action(form),
    null,
  );
  useOutcomeToast(outcome, reveal);

  return (
    <form action={run} className="space-y-4">
      {children}
      <Button type="submit" disabled={busy}>
        {busy ? "Working..." : submit}
      </Button>

      {outcome?.ok && outcome.note && reveal && (
        <div className="space-y-1.5">
          <Label className="text-success">Copy this now. It is not shown again.</Label>
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
            <code className="flex-1 overflow-x-auto whitespace-nowrap">{outcome.note}</code>
            <button
              type="button"
              className="text-muted-foreground hover:text-foreground"
              onClick={() => navigator.clipboard.writeText(outcome.note!)}
              aria-label="Copy"
            >
              <Copy className="size-3.5" />
            </button>
          </div>
        </div>
      )}
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

export function Inline({ action, submit, children, danger }: {
  action: Action;
  submit: string;
  children?: React.ReactNode;
  danger?: boolean;
}) {
  const [outcome, run, busy] = useActionState<Outcome | null, FormData>(
    async (_previous, form) => action(form),
    null,
  );
  useOutcomeToast(outcome);

  return (
    <form action={run} className="inline">
      {children}
      <Button type="submit" variant="ghost" size="sm" disabled={busy} className={danger ? "text-destructive hover:text-destructive" : undefined}>
        {busy ? "..." : submit}
      </Button>
    </form>
  );
}
