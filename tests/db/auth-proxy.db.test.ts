import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import {
  PREVIEW_URL,
  PRODUCTION_URL,
  authAt,
  completeProxiedSignIn,
  cookiesFrom,
  emailFor,
  proxiedProfile,
  startSignIn,
} from "./auth";
import { appPool } from "./support";

// ADR 0012, "Previews sign in through production": a preview completes the sign-in production
// relays to it, and production completes none, so OAUTH_PROXY_SECRET, which every preview holds,
// signs no one in on production.

const pool = appPool(2);
const db = drizzle(pool);

const accountsWith = async (email: string) =>
  (await pool.query(`select 1 from auth."user" where email = $1`, [email])).rowCount;

describe("the OAuth proxy", () => {
  const created: string[] = [];

  afterAll(async () => {
    await pool.query(`delete from auth."user" where email = any($1)`, [created]);
    await pool.end();
  });

  it("lets a preview complete a sign-in relayed by production, keeping no provider token", async () => {
    const preview = authAt(db, { at: "preview", signUp: true });
    const email = emailFor("preview");
    created.push(email);
    const state = await startSignIn(preview, PREVIEW_URL);

    const response = await completeProxiedSignIn(
      preview,
      PREVIEW_URL,
      await proxiedProfile(state, { email, accountId: "2001" }),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/en");
    expect(cookiesFrom(response)).not.toBe("");
    const tokens = await pool.query(
      `select access_token, refresh_token, id_token from auth.account a
       join auth."user" u on u.id = a.user_id where u.email = $1`,
      [email],
    );
    expect(tokens.rows).toEqual([{ access_token: null, refresh_token: null, id_token: null }]);
  });

  it.each([
    "/callback/github/oauth-proxy",
    "/callback/google/oauth-proxy",
    "/callback/any-provider/oauth-proxy",
    "/oauth-proxy-callback",
  ])("signs no one in on production with a forged profile at %s", async (path) => {
    const email = emailFor("victim");
    created.push(email);
    const existing = await (
      await authAt(db, { at: "production", signUp: true }).$context
    ).internalAdapter.createOAuthUser(
      { name: "Grace Synthetic", email, emailVerified: true },
      { providerId: "github", accountId: "2002" },
    );
    const production = authAt(db, { at: "production", signUp: false });
    const state = await startSignIn(production, PRODUCTION_URL);
    const providerId = path.split("/")[2] ?? "github";

    const response = await completeProxiedSignIn(
      production,
      PRODUCTION_URL,
      await proxiedProfile(state, { email, accountId: "2002", providerId }),
      path,
    );

    expect(response.status).toBe(404);
    expect(cookiesFrom(response)).toBe("");
    const sessions = await pool.query(`select 1 from auth.session where user_id = $1`, [
      existing?.user.id,
    ]);
    expect(sessions.rowCount).toBe(0);
  });

  it("sends a new account back to the sign-in page with sign-up off", async () => {
    const preview = authAt(db, { at: "preview", signUp: false });
    const email = emailFor("closed");
    const state = await startSignIn(preview, PREVIEW_URL);

    const response = await completeProxiedSignIn(
      preview,
      PREVIEW_URL,
      await proxiedProfile(state, { email, accountId: "2003" }),
    );

    expect(response.status).toBe(302);
    const location = new URL(response.headers.get("location") ?? "", PREVIEW_URL);
    expect(location.pathname).toBe("/en/sign-in");
    expect(location.searchParams.get("error")).toBe("signup_disabled");
    expect(await accountsWith(email)).toBe(0);
  });
});
