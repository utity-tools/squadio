import { count, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type Member, memberAccessContext, memberEditContext, memberOf } from "@/db/access";
import { DEMO_IDS, seedDemo } from "@/db/demo-seed";
import { loadScenario } from "@/db/load-scenario";
import { assignments, categoryRates, people } from "@/db/schema";
import { type TenantTransaction, withOrganization } from "@/db/tenant";
import { copyId } from "@/lib/visitors/copy-id";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, userIdOf } from "./members";
import { SOME_DAY, appPool } from "./support";

// ADR 0015, amendment of 2026-11-23: the owner stays the owner. The database allows one owner
// membership per organization, beside any number of members and viewers.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
const emails: string[] = [];

/** The Postgres error a unique index raises. */
const UNIQUE_VIOLATION = "23505";

/** A new account, signed in on the preview, without a membership yet. */
async function account(label: string) {
  const email = emailFor(label);
  emails.push(email);
  await signInOnPreview(auth, email);
  return userIdOf(pool, email);
}

const join = (organizationId: string, userId: string, role: string) =>
  pool.query(`insert into auth.member (organization_id, user_id, role) values ($1, $2, $3)`, [
    organizationId,
    userId,
    role,
  ]);

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  ada = await ownerOfACopy(pool, app, auth, "ada");
  emails.push(ada.email);
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [emails]);
  await pool.end();
});

describe("an organization's owner", () => {
  it("is the only one: a second owner membership is refused", async () => {
    const userId = await account("second-owner");

    await expect(join(ada.organizationId, userId, "owner")).rejects.toMatchObject({
      code: UNIQUE_VIOLATION,
    });
  });

  it("cannot be made by changing another membership's role", async () => {
    const userId = await account("promoted");
    await join(ada.organizationId, userId, "member");

    await expect(
      pool.query(`update auth.member set role = 'owner' where user_id = $1`, [userId]),
    ).rejects.toMatchObject({ code: UNIQUE_VIOLATION });
  });

  it("sits beside any number of members and viewers", async () => {
    for (const role of ["member", "member", "viewer", "viewer"]) {
      await join(ada.organizationId, await account(role), role);
    }

    const { rows } = await pool.query<{ role: string; members: number }>(
      `select role, count(*)::int as members from auth.member
        where organization_id = $1 group by role order by role`,
      [ada.organizationId],
    );
    expect(rows).toEqual([
      { role: "member", members: 3 },
      { role: "owner", members: 1 },
      { role: "viewer", members: 2 },
    ]);
  });

  it("may own other organizations: the rule is per organization", async () => {
    const other = await ownerOfACopy(pool, app, auth, "other");
    emails.push(other.email);

    await expect(join(other.organizationId, ada.userId, "member")).resolves.toBeDefined();
  });
});

// ADR 0015, "Roles": a member has rate access and edits; a viewer reads structure and hours only,
// and the database refuses its writes.
describe("a member and a viewer of an organization", () => {
  /** A new account that joins Ada's organization with `role`, resolved as the server would. */
  async function joined(role: string): Promise<Member> {
    const userId = await account(role);
    await join(ada.organizationId, userId, role);
    const resolved = await memberOf(app, { userId, activeOrganizationId: ada.organizationId });
    if (!resolved) throw new Error(`expected a ${role}'s membership`);
    return resolved;
  }

  const rates = (context: ReturnType<typeof memberAccessContext>) =>
    withOrganization(app, context, async (tx) =>
      (await tx.select({ rows: count() }).from(categoryRates)).map(({ rows }) => rows),
    );

  const guide = () => copyId(DEMO_IDS.guideScenario, ada.organizationId);

  it("gives a member rate access, editing and choosing, but not managing", async () => {
    const member = await joined("member");

    expect(member.capabilities).toEqual({
      rateAccess: true,
      edit: true,
      choose: true,
      manage: false,
    });
    expect(await rates(memberAccessContext(member))).not.toEqual([0]);
  });

  it("lets a member write the organization's data", async () => {
    const member = await joined("member");

    const renamed = await withOrganization(app, memberEditContext(member), (tx) =>
      tx
        .update(assignments)
        .set({ projectRole: "Renamed by a member" })
        .where(eq(assignments.scenarioId, guide()))
        .returning({ id: assignments.id }),
    );
    expect(renamed.length).toBeGreaterThan(0);
  });

  it("lets a viewer read the organization's scenarios, without money", async () => {
    const viewer = await joined("viewer");
    const context = memberAccessContext(viewer);

    const scenario = await loadScenario(app, context, guide(), SOME_DAY);
    expect(scenario?.team.length).toBeGreaterThan(0);
    expect(scenario?.rateAccess).toBe(false);
    expect(await rates(context)).toEqual([0]);
  });

  it.each([
    ["a person", (tx: TenantTransaction) => tx.update(people).set({ name: "Renamed by a viewer" })],
    [
      "an assignment",
      (tx: TenantTransaction) => tx.delete(assignments).where(eq(assignments.scenarioId, guide())),
    ],
  ])("refuses a viewer's write to %s in the database", async (_label, write) => {
    const viewer = await joined("viewer");

    for (const context of [memberAccessContext(viewer), memberEditContext(viewer)]) {
      await expect(withOrganization(app, context, write)).rejects.toMatchObject({
        cause: { code: "25006" },
      });
    }
    const [left] = await withOrganization(app, memberAccessContext(viewer), (tx) =>
      tx.select({ rows: count() }).from(assignments).where(eq(assignments.scenarioId, guide())),
    );
    expect(left?.rows).toBeGreaterThan(0);
  });

  it("refuses a viewer even a write it would make with rate access", async () => {
    const viewer = await joined("viewer");
    const forged = { ...memberEditContext(viewer), rateAccess: true };

    await expect(
      withOrganization(app, forged, (tx) => tx.execute(sql`delete from category_rates`)),
    ).rejects.toMatchObject({ cause: { code: "25006" } });
  });
});
