import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, FileArchive } from "lucide-react";
import { maybe } from "@/lib/api";
import { cancelJob, deleteJob } from "@/lib/actions";
import type { Job } from "@/lib/types";
import { FORMAT_LABELS, finished } from "@/lib/types";
import { ago, bytes, duration, shortUrl } from "@/lib/format";
import { Act } from "@/components/Act";
import { JobLog } from "@/components/JobLog";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** The bar under the title while a download runs. Sized from what yt-dlp last reported. */
function Progress({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

export default async function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const job = await maybe<Job>(`/api/jobs/${id}`);
  if (!job) notFound();

  const over = finished(job);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-3.5" /> Downloads
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold tracking-tight">
              <span className="truncate">{job.title || shortUrl(job.url)}</span>
              <StatusBadge status={job.status} />
            </h1>
            <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{job.url}</p>
          </div>
          {!over && <Act action={cancelJob} values={{ id: job.id }} submit="Cancel" variant="outline" />}
        </div>
      </div>

      {job.status === "running" && <Progress percent={job.progress} />}

      {job.error && (
        <Card className="border-destructive/40">
          <CardContent className="text-sm">{job.error}</CardContent>
        </Card>
      )}

      {job.files.length > 0 && (
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-muted-foreground">Files</h2>
            {job.files.length > 1 && (
              <Button variant="outline" size="sm" asChild>
                {/* A plain anchor: this leaves the app and saves a file. */}
                <a href={`/archive/${job.id}`} download>
                  <FileArchive className="size-3.5" /> Download all as zip
                </a>
              </Button>
            )}
          </div>

          <Card>
            <CardContent>
              <Table>
                <TableBody>
                  {job.files.map((file, index) => (
                    <TableRow key={file.name} className="last:border-b-0">
                      <TableCell className="max-w-96 truncate font-mono text-xs">{file.name}</TableCell>
                      <TableCell className="w-24 text-right font-mono text-xs">{bytes(file.size)}</TableCell>
                      <TableCell className="w-28 text-right">
                        <Button variant="ghost" size="sm" asChild>
                          <a href={`/file/${job.id}/${index}`} download>
                            <Download className="size-3.5" /> save
                          </a>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}

      <div>
        <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">Log</h2>
        <JobLog jobId={job.id} status={job.status} />
      </div>

      <div>
        <h2 className="mb-2.5 text-sm font-semibold text-muted-foreground">Details</h2>
        <Card>
          <CardContent>
            <Table>
              <TableBody>
                <TableRow>
                  <TableCell className="w-40 text-muted-foreground">Format</TableCell>
                  <TableCell className="font-mono text-xs">
                    {FORMAT_LABELS[job.format]}
                    {job.format === "video" && job.maxHeight > 0 && ` up to ${job.maxHeight}p`}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell className="text-muted-foreground">Queued</TableCell>
                  <TableCell className="font-mono text-xs">{ago(job.queuedAt)}</TableCell>
                </TableRow>
                <TableRow className="last:border-b-0">
                  <TableCell className="text-muted-foreground">Took</TableCell>
                  <TableCell className="font-mono text-xs">{duration(job.startedAt, job.finishedAt)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {over && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">Delete this download</div>
              <p className="text-muted-foreground">Its files and log go with it.</p>
            </div>
            <Act
              action={deleteJob}
              values={{ id: job.id }}
              submit="Delete"
              variant="destructive"
              confirm="Delete this download and its files?"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
