import { count, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberAccessContext, memberEditContext, memberOf } from "@/db/access";
import { DEMO_IDS, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import { categories, categoryRates, scenarios } from "@/db/schema";
import { withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { PREVIEW_URL, authAt, emailFor, signInOnPreview } from "./auth";
import {
  type TestMember,
  ownerOfACopy as ownerOfAnyCopy,
  sessionOf as sessionOfMember,
  userIdOf as userIdOfAccount,
} from "./members";
import { SOME_DAY, appPool, newOrganization } from "./support";

// ADR 0012, "Membership and the access context": the server resolves session → member →
// organization → capabilities before any tenant query. A member reaches their own organization
// only, and their rate access follows their membership. Accounts sign in through Better Auth's
// real handler; no test reaches GitHub or Google.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let bob: TestMember;

const userIdOf = (email: string) => userIdOfAccount(pool, email);
const ownerOfACopy = (label: string) => ownerOfAnyCopy(pool, app, auth, label);
const sessionOf = (member: TestMember) => sessionOfMember(auth, member);

const setActive = (account: TestMember, organizationId: string | null) =>
  pool.query(`update auth.session set active_organization_id = $2 where user_id = $1`, [
    account.userId,
    organizationId,
  ]);

const setRole = (account: TestMember, role: string) =>
  pool.query(`update auth.member set role = $2 where user_id = $1 and organization_id = $3`, [
    account.userId,
    role,
    account.organizationId,
  ]);

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  ada = await ownerOfACopy("ada");
  bob = await ownerOfACopy("bob");
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [[ada.email, bob.email]]);
  await pool.end();
});

describe("memberOf", () => {
  it("resolves a signed-in owner to their organization, with rate access, editing and choosing", async () => {
    expect(await memberOf(app, await sessionOf(ada))).toEqual({
      organizationId: ada.organizationId,
      capabilities: { rateAccess: true, edit: true, choose: true },
    });
  });

  it("works in the session's active organization when it is one of the account's own", async () => {
    await setActive(ada, ada.organizationId);
    try {
      const session = await sessionOf(ada);
      expect(session.activeOrganizationId).toBe(ada.organizationId);
      expect((await memberOf(app, session))?.organizationId).toBe(ada.organizationId);
    } finally {
      await setActive(ada, null);
    }
  });

  it("refuses an active organization the account is no member of, never falling back", async () => {
    await setActive(ada, bob.organizationId);
    try {
      expect(await memberOf(app, await sessionOf(ada))).toBeNull();
    } finally {
      await setActive(ada, null);
    }
    expect(await memberOf(app, { userId: ada.userId, activeOrganizationId: "forged" })).toBeNull();
    expect(await memberOf(app, { userId: "forged" })).toBeNull();
  });

  it("gives an account without a membership no member at all", async () => {
    const email = emailFor("without-organization");
    await signInOnPreview(auth, email);
    try {
      expect(await memberOf(app, { userId: await userIdOf(email) })).toBeNull();
    } finally {
      await pool.query(`delete from auth."user" where email = $1`, [email]);
    }
  });

  it("follows the member's role: a role v0.3 does not know grants nothing", async () => {
    await setRole(ada, "member");
    try {
      expect(await memberOf(app, await sessionOf(ada))).toBeNull();
    } finally {
      await setRole(ada, "owner");
    }
    expect((await memberOf(app, await sessionOf(ada)))?.capabilities.rateAccess).toBe(true);
  });

  it("is gone with the membership", async () => {
    const email = emailFor("leaving");
    await signInOnPreview(auth, email);
    const userId = await userIdOf(email);
    const organizationId = await newOrganization(app);
    await pool.query(
      `insert into auth.member (organization_id, user_id, role) values ($1, $2, 'owner')`,
      [organizationId, userId],
    );
    try {
      expect((await memberOf(app, { userId }))?.organizationId).toBe(organizationId);
      await pool.query(`delete from auth.member where user_id = $1`, [userId]);
      expect(await memberOf(app, { userId })).toBeNull();
    } finally {
      await pool.query(`delete from auth."user" where email = $1`, [email]);
    }
  });
});

describe("a member's context", () => {
  const memberOfAda = async () => {
    const member = await memberOf(app, await sessionOf(ada));
    if (!member) throw new Error("expected Ada's membership");
    return member;
  };

  it("reads the member's own organization only", async () => {
    const context = memberAccessContext(await memberOfAda());
    const ownScenario = copyId(DEMO_IDS.guideScenario, ada.organizationId);
    const bobsScenario = copyId(DEMO_IDS.guideScenario, bob.organizationId);

    expect(await loadScenario(app, context, ownScenario, SOME_DAY)).not.toBeNull();
    expect(await loadScenario(app, context, bobsScenario, SOME_DAY)).toBeNull();
    expect(await loadScenario(app, context, DEMO_IDS.guideScenario, SOME_DAY)).toBeNull();

    const organizations = await withOrganization(app, context, (tx) =>
      tx.execute<{ organization: string }>(
        sql`select distinct organization_id as organization from ${scenarios}`,
      ),
    );
    expect(organizations.rows).toEqual([{ organization: ada.organizationId }]);
  });

  it("cannot write into another organization, with or without rate access", async () => {
    const context = memberEditContext(await memberOfAda());
    await expect(
      withOrganization(app, context, (tx) =>
        tx.insert(categories).values({ organizationId: bob.organizationId, name: "Intruder" }),
      ),
    ).rejects.toThrow();

    const bobsRows = await withOrganization(
      app,
      { organizationId: bob.organizationId, rateAccess: true },
      (tx) => tx.select({ rows: count() }).from(categories),
    );
    const changed = await withOrganization(app, context, (tx) =>
      tx.execute(
        sql`update ${categories} set name = 'Renamed' where organization_id = ${bob.organizationId}`,
      ),
    );
    expect(changed.rowCount).toBe(0);
    expect(
      await withOrganization(app, { organizationId: bob.organizationId, rateAccess: true }, (tx) =>
        tx.select({ rows: count() }).from(categories),
      ),
    ).toEqual(bobsRows);
  });

  it("sees money with the owner's rate access, and none once ?access=none takes it away", async () => {
    const member = await memberOfAda();
    const rates = (rateAccess: boolean) =>
      withOrganization(
        app,
        rateAccess ? memberAccessContext(member) : memberAccessContext(member, { access: "none" }),
        async (tx) => (await tx.select({ rows: count() }).from(categoryRates))[0]?.rows,
      );

    expect(await rates(true)).toBeGreaterThan(0);
    expect(await rates(false)).toBe(0);
  });
});

describe("a session's request, end to end", () => {
  it("is signed in on the preview, so the sessions above are Better Auth's own", async () => {
    const response = await auth.handler(
      new Request(`${PREVIEW_URL}/api/auth/get-session`, { headers: { cookie: ada.cookie } }),
    );
    expect(((await response.json()) as { user: { email: string } }).user.email).toBe(ada.email);
  });
});
