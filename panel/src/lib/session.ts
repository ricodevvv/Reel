import { WorkerUnreachable, maybe } from "@/lib/api";

export class NoWorker extends Error {
  constructor(readonly base: string) {
    super(base);
  }
}

/**
 * Whether the request carries a session the worker accepts.
 *
 * The worker is the only thing that can answer that — it holds the signing key — so this asks it
 * rather than trying to verify a cookie the panel never issued.
 */
export async function signedIn(): Promise<boolean> {
  try {
    return (await maybe<{ authenticated: boolean }>("/api/me")) !== null;
  } catch (failure) {
    // Told apart from "not signed in" on purpose: the layout shows a sign-in card for one and an
    // error page naming the misconfiguration for the other.
    if (failure instanceof WorkerUnreachable) throw new NoWorker(failure.base);
    throw failure;
  }
}
