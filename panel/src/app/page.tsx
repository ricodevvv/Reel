import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { maybe } from "@/lib/api";
import type { Job, System } from "@/lib/types";
import { FORMAT_LABELS } from "@/lib/types";
import { ago, bytes, duration, shortUrl } from "@/lib/format";
import { DownloadForm } from "@/components/DownloadForm";
import { StatusBadge } from "@/components/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function Downloads() {
  const [system, jobs] = await Promise.all([
    maybe<System>("/api/system"),
    maybe<Job[]>("/api/jobs?limit=40"),
  ]);
  const history = jobs ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Downloads</h1>
        <p className="mt-1 max-w-xl text-sm text-muted-foreground">
          Paste a link. yt-dlp fetches it in a container on this machine and keeps what comes out —
          one file, or a whole playlist as a zip.
        </p>
      </div>

      {system && !system.docker && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <div className="font-medium">The Docker socket is not answering.</div>
              <p className="mt-1 text-muted-foreground">
                Nothing can download until it does. Check that{" "}
                <code className="font-mono text-xs">/var/run/docker.sock</code> is mounted into the worker
                and that the daemon is up.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {system?.docker && !system.ytDlp && (
        <Card className="border-destructive/40">
          <CardContent className="flex items-start gap-2 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <div className="font-medium">The fetcher image is not built.</div>
              <p className="mt-1 text-muted-foreground">
                Run <code className="font-mono text-xs">./deploy.sh update-fetcher</code> on the host to
                build it, which is also how you get a newer yt-dlp.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent>
          <DownloadForm />
        </CardContent>
      </Card>

      <div>
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-muted-foreground">History</h2>
          {system && (
            <span className="text-xs text-muted-foreground">
              {system.ytDlp && <>yt-dlp {system.ytDlp} · </>}
              {system.disk && <>{bytes(system.disk.free)} free · </>}
              last {system.jobRetention} kept
            </span>
          )}
        </div>

        <Card>
          <CardContent>
            {history.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">Nothing downloaded yet.</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>What</TableHead>
                    <TableHead className="hidden sm:table-cell">Format</TableHead>
                    <TableHead>When</TableHead>
                    <TableHead className="hidden sm:table-cell">Took</TableHead>
                    <TableHead>Files</TableHead>
                    <TableHead className="text-right">Outcome</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="max-w-72">
                        <Link href={`/jobs/${job.id}`} className="block truncate font-medium hover:underline">
                          {job.title || shortUrl(job.url)}
                        </Link>
                        {job.title && (
                          <span className="block truncate font-mono text-[10px] text-muted-foreground">
                            {shortUrl(job.url)}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
                        {FORMAT_LABELS[job.format]}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{ago(job.queuedAt)}</TableCell>
                      <TableCell className="hidden font-mono text-xs sm:table-cell">
                        {duration(job.startedAt, job.finishedAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {job.files.length > 0 ? job.files.length : "-"}
                      </TableCell>
                      <TableCell className="text-right">
                        <StatusBadge status={job.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
