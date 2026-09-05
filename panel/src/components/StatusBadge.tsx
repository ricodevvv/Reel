import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { JobStatus } from "@/lib/types";

const LOOK: Record<JobStatus, { label: string; className?: string; variant?: "secondary" | "destructive" | "outline" }> = {
  queued: { label: "queued", variant: "outline" },
  running: { label: "downloading", variant: "secondary" },
  success: { label: "done", className: "bg-success text-success-foreground" },
  failed: { label: "failed", variant: "destructive" },
  cancelled: { label: "cancelled", variant: "outline" },
};

export function StatusBadge({ status, className }: { status: JobStatus; className?: string }) {
  const look = LOOK[status];
  return (
    <Badge variant={look.variant} className={cn(look.className, className)}>
      {status === "running" && (
        <span className="mr-1 inline-block size-1.5 animate-pulse rounded-full bg-current" aria-hidden />
      )}
      {look.label}
    </Badge>
  );
}
