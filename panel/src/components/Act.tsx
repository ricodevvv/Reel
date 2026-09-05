"use client";

import { useActionState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { Outcome } from "@/lib/actions";

type Props = {
  action: (form: FormData) => Promise<Outcome>;
  submit: string;
  /** Rendered as hidden inputs, so the action reads them the same way it reads a real form. */
  values?: Record<string, string>;
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  icon?: React.ReactNode;
  busyLabel?: string;
  className?: string;
  /** Shown in a confirm dialog first. For anything that destroys history. */
  confirm?: string;
};

/**
 * A button that runs a Server Action.
 *
 * Everything on this panel that is not a full form is one of these: build now, cancel, delete.
 * They all need the same three things — a pending state, a toast on failure, and hidden fields —
 * and writing that out at each call site is how they end up behaving differently from each other.
 */
export function Act({ action, submit, values, variant, size, icon, busyLabel, className, confirm }: Props) {
  const [outcome, run, busy] = useActionState<Outcome | null, FormData>(
    async (_previous, form) => action(form),
    null,
  );
  const last = useRef<Outcome | null>(null);

  useEffect(() => {
    if (!outcome || outcome === last.current) return;
    last.current = outcome;
    if (!outcome.ok) toast.error(outcome.error);
    else if (outcome.note) toast.success(outcome.note);
  }, [outcome]);

  return (
    <form
      action={run}
      className={className}
      onSubmit={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {Object.entries(values ?? {}).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <Button type="submit" variant={variant} size={size} disabled={busy}>
        {!busy && icon}
        {busy ? (busyLabel ?? "Working...") : submit}
      </Button>
    </form>
  );
}
