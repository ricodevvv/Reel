import { relay } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * One downloaded file.
 *
 * Proxied rather than linked at the worker directly, so the browser only ever needs to reach the
 * panel's own origin and the worker can stay on the internal network.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; index: string }> },
): Promise<Response> {
  const { id, index } = await params;
  return relay(
    `/api/jobs/${encodeURIComponent(id)}/files/${encodeURIComponent(index)}`,
    "application/octet-stream",
  );
}
