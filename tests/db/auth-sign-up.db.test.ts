import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { authAt, emailFor } from "./auth";
import { appPool } from "./support";

// ADR 0012, "Tests": with the sign-up switch off no account can be created, on any path. Better
// Auth creates every account (a provider's callback, the OAuth proxy on a preview) through its
// internal adapter, which runs the same database hooks as these calls.

const pool = appPool(2);
const db = drizzle(pool);

const authWith = (signUp: boolean) => authAt(db, { at: "production", signUp });

const accountsWith = async (email: string) =>
  (await pool.query(`select 1 from auth."user" where email = $1`, [email])).rowCount;

describe("the sign-up switch", () => {
  const created: string[] = [];

  afterAll(async () => {
    await pool.query(`delete from auth."user" where email = any($1)`, [created]);
    await pool.end();
  });

  it("refuses to create an account when off", async () => {
    const { internalAdapter } = await authWith(false).$context;
    const email = emailFor("off");

    await expect(
      internalAdapter.createOAuthUser(
        { name: "Ada Synthetic", email, emailVerified: true },
        { providerId: "github", accountId: "1001" },
      ),
    ).rejects.toThrow(/sign-up is off/i);
    expect(await accountsWith(email)).toBe(0);
  });

  it("creates the account and its provider link when on", async () => {
    const { internalAdapter } = await authWith(true).$context;
    const email = emailFor("on");
    created.push(email);

    const result = await internalAdapter.createOAuthUser(
      { name: "Grace Synthetic", email, emailVerified: true },
      { providerId: "github", accountId: "1002" },
    );

    expect(result?.user.email).toBe(email);
    expect(result?.user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(await accountsWith(email)).toBe(1);
  });

  it("still lets an existing account sign in when off", async () => {
    const email = emailFor("existing");
    created.push(email);
    const { internalAdapter: open } = await authWith(true).$context;
    const existing = await open.createOAuthUser(
      { name: "Hedy Synthetic", email, emailVerified: true },
      { providerId: "github", accountId: "1003" },
    );
    const { internalAdapter } = await authWith(false).$context;

    const session = await internalAdapter.createSession(existing?.user.id ?? "");

    expect(session.userId).toBe(existing?.user.id);
  });
});
