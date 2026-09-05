import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/**
 * A short, URL-safe, lowercase id. Short enough to read out loud from a log line, random enough
 * that two builds queued in the same millisecond cannot collide.
 */
export function newId(length = 12): string {
  const bytes = randomBytes(length);
  let id = "";
  for (const byte of bytes) id += ALPHABET[byte % ALPHABET.length];
  return id;
}

/** Ids reach the filesystem as directory names, so nothing but this shape is ever accepted back. */
export function isId(value: string): boolean {
  return /^[0-9a-z]{4,32}$/.test(value);
}
