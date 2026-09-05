import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold tracking-tight">Not here</h1>
      <p className="text-sm text-muted-foreground">That job does not exist, or it has been deleted.</p>
      <Button asChild variant="outline">
        <Link href="/">Back to downloads</Link>
      </Button>
    </div>
  );
}
