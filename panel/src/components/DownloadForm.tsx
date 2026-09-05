"use client";

import { useActionState, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { startJob, type Outcome } from "@/lib/actions";
import type { Format } from "@/lib/types";

/** Heights offered as a cap. "0" means whatever the source's best is. */
const HEIGHTS = [
  { value: "0", label: "Best available" },
  { value: "2160", label: "Up to 2160p" },
  { value: "1080", label: "Up to 1080p" },
  { value: "720", label: "Up to 720p" },
  { value: "480", label: "Up to 480p" },
];

export function DownloadForm() {
  const [outcome, run, busy] = useActionState<Outcome | null, FormData>(
    async (_previous, form) => startJob(form),
    null,
  );
  // The resolution cap only means something for video, so it disappears for the audio formats
  // rather than sitting there doing nothing.
  const [format, setFormat] = useState<Format>("video");

  return (
    <form action={run} className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground">URL</Label>
        <Input
          name="url"
          placeholder="https://www.youtube.com/watch?v=..."
          required
          autoFocus
          spellCheck={false}
          inputMode="url"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="text-xs font-medium text-muted-foreground">Format</Label>
          <Select name="format" value={format} onValueChange={(value) => setFormat(value as Format)}>
            <SelectTrigger className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="video">Video (mp4)</SelectItem>
              <SelectItem value="audio-m4a">Audio (m4a)</SelectItem>
              <SelectItem value="audio-mp3">Audio (mp3)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {format === "video" && (
          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-muted-foreground">Resolution</Label>
            <Select name="maxHeight" defaultValue="0">
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HEIGHTS.map((height) => (
                  <SelectItem key={height.value} value={height.value}>
                    {height.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <Button type="submit" disabled={busy}>
        {!busy && <Download />}
        {busy ? "Queueing..." : "Download"}
      </Button>

      {outcome && !outcome.ok && <p className="text-sm text-destructive">{outcome.error}</p>}
    </form>
  );
}
