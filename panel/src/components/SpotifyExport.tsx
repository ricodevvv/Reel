"use client";

import { useActionState } from "react";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readPlaylist, type PlaylistOutcome } from "@/lib/actions";
import { clock } from "@/lib/format";

/**
 * Reads a public playlist and shows what is in it.
 *
 * Metadata only, and that is the whole feature: enough to rebuild the playlist somewhere else or
 * keep a record of it. Spotify does not hand out the recordings, and this does not go looking for
 * them anywhere else.
 */
export function SpotifyExport({ configured }: { configured: boolean }) {
  const [outcome, run, busy] = useActionState<PlaylistOutcome | null, FormData>(
    async (_previous, form) => readPlaylist(form),
    null,
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-4">
          <form action={run} className="flex flex-wrap items-center gap-2">
            <Input
              name="playlist"
              placeholder="https://open.spotify.com/playlist/..."
              className="flex-1 min-w-64"
              spellCheck={false}
              inputMode="url"
              required
              disabled={!configured}
            />
            <Button type="submit" disabled={busy || !configured}>
              {!busy && <Search />}
              {busy ? "Reading..." : "Read playlist"}
            </Button>
          </form>

          {!configured && (
            <p className="text-sm text-destructive">
              Spotify credentials are not set. Add an application&apos;s client id and secret with{" "}
              <code className="font-mono text-xs">./deploy.sh spotify &lt;id&gt; &lt;secret&gt;</code>.
            </p>
          )}
          {outcome && !outcome.ok && <p className="text-sm text-destructive">{outcome.error}</p>}
        </CardContent>
      </Card>

      {outcome?.ok && (
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">
              {outcome.playlist.name}
              {outcome.playlist.owner && <span className="font-normal"> · {outcome.playlist.owner}</span>}
              <span className="font-normal"> · {outcome.playlist.total} tracks</span>
            </h2>
            <Button variant="outline" size="sm" asChild>
              {/* A plain anchor: this leaves the app and saves a file. */}
              <a href={`/playlist/${outcome.playlist.id}`} download>
                <Download className="size-3.5" /> Export CSV
              </a>
            </Button>
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Artists</TableHead>
                    <TableHead className="hidden md:table-cell">Album</TableHead>
                    <TableHead className="text-right">Length</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {outcome.playlist.tracks.map((track) => (
                    <TableRow key={`${track.position}-${track.isrc}`}>
                      <TableCell className="font-mono text-xs text-muted-foreground">{track.position}</TableCell>
                      <TableCell className="max-w-64 truncate">
                        {track.url ? (
                          <a href={track.url} target="_blank" rel="noreferrer" className="hover:underline">
                            {track.title}
                          </a>
                        ) : (
                          track.title
                        )}
                      </TableCell>
                      <TableCell className="max-w-48 truncate text-muted-foreground">{track.artists}</TableCell>
                      <TableCell className="hidden max-w-48 truncate text-muted-foreground md:table-cell">
                        {track.album}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{clock(track.durationMs)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
