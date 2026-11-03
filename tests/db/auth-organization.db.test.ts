import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PREVIEW_URL, authAt, emailFor, post, signInOnPreview } from "./auth";
import { appPool } from "./support";

// ADR 0012, the organization plugin's limits: in v0.3 only the server creates and changes
// organizations, each has one member and none invites anyone. A signed-in browser can do none of
// it through /api/auth.

const pool = appPool(2);
const db = drizzle(pool);
const auth = authAt(db, { at: "preview", signUp: true });
const email = emailFor("member");
const slug = `synthetic-${crypto.randomUUID()}`;

let cookie = "";
let organizationId = "";

beforeAll(async () => {
  cookie = await signInOnPreview(auth, email);
  const user = await pool.query<{ id: string }>(`select id from auth."user" where email = $1`, [
    email,
  ]);
  const organization = await auth.api.createOrganization({
    body: { name: "Synthetic Consulting", slug, userId: user.rows[0]?.id },
  });
  organizationId = organization?.id ?? "";
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = $1`, [email]);
  await pool.query(`delete from auth.organization where slug = $1`, [slug]);
  await pool.end();
});

const browser = (path: string, body: unknown) =>
  post(auth, `${PREVIEW_URL}/api/auth/organization/${path}`, body, cookie);

describe("the organization plugin, from the browser", () => {
  it("is signed in, so the refusals below are the plugin's", async () => {
    const response = await auth.handler(
      new Request(`${PREVIEW_URL}/api/auth/get-session`, { headers: { cookie } }),
    );

    expect(((await response.json()) as { user: { email: string } }).user.email).toBe(email);
  });

  it("cannot create an organization", async () => {
    const response = await browser("create", { name: "Another", slug: `other-${slug}` });

    expect(response.status).toBe(403);
  });

  it("cannot invite anyone", async () => {
    const response = await browser("invite-member", {
      email: emailFor("invited"),
      role: "member",
      organizationId,
    });

    expect(response.status).toBe(403);
  });

  it.each([
    ["update", { organizationId, data: { name: "Renamed" } }],
    ["delete", { organizationId }],
  ])("cannot %s it", async (path, body) => {
    const response = await browser(path, body);

    expect(response.status).toBe(404);
    const row = await pool.query(`select name from auth.organization where id = $1`, [
      organizationId,
    ]);
    expect(row.rows).toEqual([{ name: "Synthetic Consulting" }]);
  });
});
