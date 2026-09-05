import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { config } from "./config.js";
import { log } from "./log.js";

const COOKIE = "reel_session";
const SCRYPT_KEY_BYTES = 32;

function constantEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  // timingSafeEqual throws on a length mismatch, which would itself leak the length.
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, SCRYPT_KEY_BYTES).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const derived = scryptSync(password, salt, SCRYPT_KEY_BYTES).toString("hex");
  return constantEquals(derived, expected);
}

/**
 * The hash this process checks logins against.
 *
 * REEL_PASSWORD_HASH is the production form. REEL_PASSWORD is hashed once at boot as a
 * convenience for a first run, and is deliberately not persisted anywhere.
 */
const hash: string | null = (() => {
  if (config.passwordHash) return config.passwordHash;
  if (config.password) return hashPassword(config.password);
  return null;
})();

export function passwordConfigured(): boolean {
  return hash !== null;
}

export function checkPassword(password: string): boolean {
  if (!hash) return false;
  return verifyPassword(password, hash);
}

function sign(payload: string): string {
  return createHmac("sha256", config.sessionSecret).update(payload).digest("base64url");
}

/**
 * A session cookie: expiry, nonce, and who it belongs to, signed.
 *
 * The subject rides along so the panel can say who is signed in and a build can record who asked
 * for it. It is inside the signature, so it is as trustworthy as the session itself; nothing here
 * reads it back out of anywhere else.
 */
export function issueSession(subject: string): { value: string; maxAge: number } {
  const maxAge = config.sessionHours * 3600;
  // The nonce is what makes two sessions issued in the same second distinguishable in a log.
  const payload = [
    Date.now() + maxAge * 1000,
    randomBytes(9).toString("base64url"),
    Buffer.from(subject).toString("base64url"),
  ].join(".");
  return { value: `${payload}.${sign(payload)}`, maxAge };
}

/** The subject of a valid, unexpired session, or null. */
function readSession(value: string): string | null {
  const cut = value.lastIndexOf(".");
  if (cut <= 0) return null;
  const payload = value.slice(0, cut);
  if (!constantEquals(value.slice(cut + 1), sign(payload))) return null;

  const [expiry, , subject] = payload.split(".");
  if (!Number.isFinite(Number(expiry)) || Number(expiry) <= Date.now()) return null;
  return subject ? Buffer.from(subject, "base64url").toString("utf8") : "someone";
}

export function cookie(header: string | undefined, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const cut = part.indexOf("=");
    if (cut < 0) continue;
    if (part.slice(0, cut).trim() === name) return decodeURIComponent(part.slice(cut + 1).trim());
  }
  return null;
}

/**
 * Who is making this request, or null.
 *
 * Either a signed session cookie from the panel, or the shared bearer token for scripts. The token
 * is optional and unset by default; when it is set it is the only way in without a browser.
 */
export function identify(headers: { cookie?: string; authorization?: string }): string | null {
  const session = cookie(headers.cookie, COOKIE);
  if (session) {
    const subject = readSession(session);
    if (subject) return subject;
  }

  const bearer = headers.authorization ?? "";
  if (config.apiToken && bearer.startsWith("Bearer ")) {
    return constantEquals(bearer.slice("Bearer ".length), config.apiToken) ? "api token" : null;
  }
  return null;
}

export function authorized(headers: { cookie?: string; authorization?: string }): boolean {
  return identify(headers) !== null;
}

export function sessionCookie(value: string, maxAge: number, secure: boolean): string {
  return buildCookie(COOKIE, value, maxAge, secure);
}

function buildCookie(name: string, value: string, maxAge: number, secure: boolean): string {
  const attributes = [
    `${name}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAge}`,
  ];
  if (secure) attributes.push("Secure");
  return attributes.join("; ");
}

export function clearCookie(): string {
  return `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export function warnIfOpen(): void {
  if (!passwordConfigured()) {
    log.error("no REEL_PASSWORD or REEL_PASSWORD_HASH is set: every login will be refused");
  }
}
