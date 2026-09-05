import { maybe } from "@/lib/api";
import { SpotifyExport } from "@/components/SpotifyExport";

export const dynamic = "force-dynamic";

export default async function Spotify() {
  const status = await maybe<{ configured: boolean }>("/api/spotify");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Spotify playlists</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Reads what a public playlist contains — titles, artists, albums, lengths and ISRCs — and hands
          it back as a spreadsheet. That is enough to rebuild the playlist on another service or keep a
          record of it.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          There is no audio here, and that is deliberate. Spotify does not hand out the recordings, so
          anything claiming to &ldquo;download a playlist&rdquo; is really matching each title against
          some other site and taking a copy from there. This does not do that.
        </p>
      </div>

      <SpotifyExport configured={status?.configured ?? false} />
    </div>
  );
}
