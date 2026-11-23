import { organization } from "better-auth/plugins";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PREVIEW_URL, authAt, emailFor, post, signInOnPreview } from "./auth";
import { appPool } from "./support";

// ADR 0012, the organization plugin's limits: only the server creates and changes organizations,
// and their memberships and invitations (ADR 0015, amendment of 2026-11-23). A signed-in browser
// can do none of it through /api/auth.

const pool = appPool(2);
const db = drizzle(pool);
const auth = authAt(db, { at: "preview", signUp: true });
const email = emailFor("member");
const slug = `synthetic-${crypto.randomUUID()}`;

let cookie = "";
let organizationId = "";
let memberId = "";

beforeAll(async () => {
  cookie = await signInOnPreview(auth, email);
  const user = await pool.query<{ id: string }>(`select id from auth."user" where email = $1`, [
    email,
  ]);
  const organization = await auth.api.createOrganization({
    body: { name: "Synthetic Consulting", slug, userId: user.rows[0]?.id },
  });
  organizationId = organization?.id ?? "";
  const membership = await pool.query<{ id: string }>(
    `select id from auth.member where organization_id = $1`,
    [organizationId],
  );
  memberId = membership.rows[0]?.id ?? "";
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = $1`, [email]);
  await pool.query(`delete from auth.organization where slug = $1`, [slug]);
  await pool.end();
});

/** Every endpoint the organization plugin serves, read from the plugin as the app builds it. */
const PLUGIN_PATHS = Object.values(organization().endpoints).map((endpoint) => endpoint.path);

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

    expect(response.status).toBe(404);
  });

  it("reaches none of the plugin's endpoints: the server reads and writes memberships itself", async () => {
    expect(PLUGIN_PATHS).toContain("/organization/get-full-organization");
    for (const path of PLUGIN_PATHS) {
      for (const method of ["GET", "POST"]) {
        const response = await auth.handler(
          new Request(`${PREVIEW_URL}/api/auth${path}?organizationId=${organizationId}`, {
            method,
            headers: { cookie, "content-type": "application/json" },
            ...(method === "POST" ? { body: JSON.stringify({ organizationId }) } : {}),
          }),
        );

        expect({ path, method, status: response.status }).toEqual({ path, method, status: 404 });
      }
    }
  });

  it.each([
    ["invite-member", () => ({ email: emailFor("invited"), role: "member", organizationId })],
    ["accept-invitation", () => ({ invitationId: crypto.randomUUID() })],
    ["reject-invitation", () => ({ invitationId: crypto.randomUUID() })],
    ["cancel-invitation", () => ({ invitationId: crypto.randomUUID() })],
  ])("cannot %s: Squadio writes invitations itself", async (path, body) => {
    const response = await browser(path, body());

    expect(response.status).toBe(404);
    const rows = await pool.query(`select id from auth.invitation where organization_id = $1`, [
      organizationId,
    ]);
    expect(rows.rows).toEqual([]);
  });

  it.each([
    ["get-invitation", `?id=${crypto.randomUUID()}`],
    ["list-invitations", `?organizationId=${organizationId}`],
    ["list-user-invitations", ""],
  ])("cannot read invitations through %s", async (path, query) => {
    const response = await auth.handler(
      new Request(`${PREVIEW_URL}/api/auth/organization/${path}${query}`, { headers: { cookie } }),
    );

    expect(response.status).toBe(404);
  });

  it.each([
    ["leave", () => ({ organizationId })],
    ["remove-member", () => ({ organizationId, memberIdOrEmail: email })],
    ["update-member-role", () => ({ organizationId, memberId, role: "member" })],
  ])(
    "cannot %s, so the member's role and rate access stay as the server set them",
    async (path, body) => {
      const response = await browser(path, body());

      expect(response.status).toBe(404);
      const row = await pool.query(`select role from auth.member where id = $1`, [memberId]);
      expect(row.rows).toEqual([{ role: "owner" }]);
    },
  );

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
