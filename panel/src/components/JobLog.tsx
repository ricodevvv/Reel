"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogStream } from "@/components/LogStream";
import { StatusBadge } from "@/components/StatusBadge";
import type { JobStatus } from "@/lib/types";

/**
 * A job's log, live.
 *
 * The stream replays whatever is already on disk before it starts following, so this renders the
 * same way for a download that finished last week and one that started two seconds ago.
 */
export function JobLog({ jobId, status: initial }: { jobId: string; status: JobStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState<JobStatus>(initial);

  return (
    <LogStream
      source={`/stream/${jobId}`}
      empty={status === "queued" ? "Waiting for a free slot..." : "No log for this job."}
      header={<StatusBadge status={status} />}
      onEnd={(payload) => {
        setStatus((payload as { status: JobStatus }).status);
        // The record carries the files and the outcome; the stream only carried the text.
        router.refresh();
      }}
    />
  );
}
