import { relay } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The worker's change notifications, for the Live indicator in the sidebar. */
export function GET(): Promise<Response> {
  return relay("/api/events", "text/event-stream");
}
