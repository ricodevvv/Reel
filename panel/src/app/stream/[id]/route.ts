import { relay } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** One job's log, as it is written. Read by the JobLog component. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return relay(`/api/jobs/${encodeURIComponent(id)}/log/stream`, "text/event-stream");
}
