import { createHash, randomBytes } from "node:crypto";

// ADR 0011, "The cookie": the visitor's cookie holds a random token, never the organization id,
// and the database keeps only the token's SHA-256. A plain hash is enough: the token has 256 bits
// of entropy, so there is nothing to guess.

/** The cookie that carries it. */
export const VISITOR_COOKIE = "squadio_visitor";

/**
 * How long the cookie lives: 400 days, the most browsers keep one. It is set on the first save
 * only, since setting a cookie in a Server Action re-renders the whole page; the copy's own life
 * is 30 days without a save (`last_saved_at`), and a cookie whose copy is gone is simply no copy.
 */
export const VISITOR_COOKIE_MAX_AGE = 400 * 24 * 60 * 60;

/** 32 random bytes, base64url: 43 characters, no padding. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** The token if `value` is one `newToken` could have made, or null: a forged cookie is no copy. */
export function parseToken(value: string | undefined): string | null {
  if (value === undefined || !/^[A-Za-z0-9_-]{43}$/.test(value)) return null;
  // Only one encoding per 32 bytes: the round trip refuses spare bits in the last character.
  return Buffer.from(value, "base64url").toString("base64url") === value ? value : null;
}

/** What the database stores and looks up: the SHA-256 of the token's text. */
export function hashToken(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}
