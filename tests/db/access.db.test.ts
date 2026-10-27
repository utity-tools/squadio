import { randomUUID } from "node:crypto";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { DEMO_ORGANIZATION_ID, accessContextFor, editContextFor } from "@/db/access";
import { hashToken, newToken } from "@/lib/visitors/token";

import { appPool, ownerPool } from "./support";

// ADR 0011, "Access": the cookie's token leads to the visitor's copy, or to the demo template.

const app = drizzle(appPool(1));
const owner = ownerPool();

afterAll(async () => {
  await app.$client.end();
  await owner.end();
});

describe("accessContextFor", () => {
  it("serves the demo template without a cookie", async () => {
    expect(await accessContextFor(app, undefined)).toEqual({
      organizationId: DEMO_ORGANIZATION_ID,
      rateAccess: true,
    });
  });

  it("serves the demo template for a malformed cookie or a token with no copy", async () => {
    for (const cookie of ["forged", newToken()]) {
      expect((await accessContextFor(app, cookie)).organizationId).toBe(DEMO_ORGANIZATION_ID);
    }
  });

  it("serves the visitor's copy for a token that has one, and ?access=none still drops rates", async () => {
    const token = newToken();
    const organizationId = randomUUID();
    await owner.query("insert into visitor_copies (token_hash, organization_id) values ($1, $2)", [
      hashToken(token),
      organizationId,
    ]);
    expect(await accessContextFor(app, token)).toEqual({ organizationId, rateAccess: true });
    expect(await accessContextFor(app, token, { access: "none" })).toEqual({
      organizationId,
      rateAccess: false,
    });
  });
});

describe("editContextFor", () => {
  it("is the visitor's copy without rate access, with the token that leads to it", async () => {
    const token = newToken();
    const organizationId = randomUUID();
    await owner.query("insert into visitor_copies (token_hash, organization_id) values ($1, $2)", [
      hashToken(token),
      organizationId,
    ]);
    expect(await editContextFor(app, token)).toEqual({
      token,
      context: { organizationId, rateAccess: false },
    });
  });

  it("is nothing without a copy: no cookie, a forged one, or a token with no copy", async () => {
    for (const cookie of [undefined, "forged", newToken()]) {
      expect(await editContextFor(app, cookie)).toBeNull();
    }
  });
});
