"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { api, ApiError, WORKER } from "@/lib/api";
import type { Job, Playlist } from "@/lib/types";

export type Outcome = { ok: true; note?: string } | { ok: false; error: string };

const COOKIE = "reel_session";

function say(failure: unknown): Outcome {
  if (failure instanceof ApiError) return { ok: false, error: failure.message };
  return { ok: false, error: "That did not reach the worker." };
}

async function attempt(work: () => Promise<unknown>, revalidate: string[], note?: string): Promise<Outcome> {
  try {
    await work();
  } catch (failure) {
    return say(failure);
  }
  for (const path of revalidate) revalidatePath(path);
  return { ok: true, note };
}

const field = (form: FormData, name: string) => String(form.get(name) ?? "").trim();

// ---- session ------------------------------------------------------------------------------------

/**
 * Signs in.
 *
 * The worker issues the cookie, but its Set-Cookie lands on a server-side fetch rather than on the
 * browser, so the value is lifted out and re-set through Next. Secure is read off what the worker
 * issued rather than guessed at: a Secure cookie on a panel served over plain HTTP is silently
 * dropped, and the symptom is a login that appears to work and lands back on the sign-in screen.
 */
export async function signIn(form: FormData): Promise<Outcome> {
  const password = String(form.get("password") ?? "");
  if (!password) return { ok: false, error: "Enter the panel password." };

  let response: Response;
  try {
    response = await fetch(`${WORKER}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
    });
  } catch {
    return { ok: false, error: "The worker is not answering." };
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { ok: false, error: body.error ?? "That did not work." };
  }

  const issued = response.headers.getSetCookie().find((header) => header.startsWith(`${COOKIE}=`));
  if (!issued) return { ok: false, error: "The worker did not issue a session." };

  (await cookies()).set(COOKIE, issued.slice(`${COOKIE}=`.length).split(";")[0] ?? "", {
    httpOnly: true,
    sameSite: "lax",
    secure: /;\s*Secure/i.test(issued),
    path: "/",
    maxAge: Number(/Max-Age=(\d+)/i.exec(issued)?.[1] ?? 60 * 60 * 24),
  });
  redirect("/");
}

export async function signOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
  redirect("/");
}

// ---- downloads ----------------------------------------------------------------------------------

export async function startJob(form: FormData): Promise<Outcome> {
  const body = {
    url: field(form, "url"),
    format: field(form, "format") || "video",
    maxHeight: Number(field(form, "maxHeight") || 0),
  };

  let job: Job;
  try {
    job = await api.post<Job>("/api/jobs", body);
  } catch (failure) {
    return say(failure);
  }
  revalidatePath("/");
  redirect(`/jobs/${job.id}`);
}

export async function cancelJob(form: FormData): Promise<Outcome> {
  const id = field(form, "id");
  return attempt(() => api.post(`/api/jobs/${id}/cancel`), ["/", `/jobs/${id}`], "Stopping.");
}

export async function deleteJob(form: FormData): Promise<Outcome> {
  const id = field(form, "id");
  try {
    await api.delete(`/api/jobs/${id}`);
  } catch (failure) {
    return say(failure);
  }
  revalidatePath("/");
  redirect("/");
}

// ---- spotify ------------------------------------------------------------------------------------

export type PlaylistOutcome = { ok: true; playlist: Playlist } | { ok: false; error: string };

/**
 * Reads a public Spotify playlist's track list. Metadata only — there is no audio behind this.
 */
export async function readPlaylist(form: FormData): Promise<PlaylistOutcome> {
  const playlist = field(form, "playlist");
  if (!playlist) return { ok: false, error: "Paste a Spotify playlist link." };

  try {
    return { ok: true, playlist: await api.post<Playlist>("/api/spotify/playlist", { playlist }) };
  } catch (failure) {
    const said = say(failure);
    return said.ok ? { ok: false, error: "That did not work." } : said;
  }
}
