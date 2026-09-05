import { relay } from "@/lib/proxy";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** A Spotify playlist's track list as a spreadsheet. Metadata only; there is no audio here. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const { id } = await params;
  return relay(`/api/spotify/playlist/${encodeURIComponent(id)}/csv`, "text/csv");
}
