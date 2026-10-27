// @vitest-environment node
// ADR 0011, "The cookie": a random token, kept in the database only as its SHA-256.
import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { VISITOR_COOKIE_MAX_AGE, hashToken, newToken, parseToken } from "./token";

describe("newToken", () => {
  it("is 32 random bytes in base64url", () => {
    const token = newToken();
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, "base64url")).toHaveLength(32);
  });

  it("is new every time", () => {
    const tokens = new Set(Array.from({ length: 100 }, newToken));
    expect(tokens.size).toBe(100);
  });
});

describe("parseToken", () => {
  it("accepts what newToken makes", () => {
    const token = newToken();
    expect(parseToken(token)).toBe(token);
  });

  it("refuses anything else, so a forged cookie is simply no copy", () => {
    for (const value of [
      undefined,
      "",
      "short",
      `${newToken()}x`,
      `${newToken().slice(1)}=`,
      "a".repeat(43).replace(/a$/, "!"),
    ]) {
      expect(parseToken(value)).toBeNull();
    }
  });

  it("refuses a token whose last character carries bits beyond 32 bytes", () => {
    // 43 base64url characters hold 258 bits; the last one must leave the extra two at zero.
    expect(parseToken(`${"A".repeat(42)}B`)).toBeNull();
    expect(parseToken(`${"A".repeat(42)}E`)).toBe(`${"A".repeat(42)}E`);
  });
});

describe("hashToken", () => {
  it("is the SHA-256 of the token's text", () => {
    const token = newToken();
    expect(hashToken(token)).toEqual(createHash("sha256").update(token).digest());
    expect(hashToken(token)).toHaveLength(32);
  });
});

describe("VISITOR_COOKIE_MAX_AGE", () => {
  it("is 400 days, the most browsers keep a cookie", () => {
    expect(VISITOR_COOKIE_MAX_AGE).toBe(400 * 86_400);
  });
});
