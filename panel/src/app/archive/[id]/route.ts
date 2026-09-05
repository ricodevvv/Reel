import { relay } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Everything a job produced, as one zip. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return relay(`/api/jobs/${encodeURIComponent(id)}/archive`, "application/zip");
}
