import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { memberOf } from "@/db/access";
import { DEMO_ORGANIZATION_ID, seedDemo } from "@/db/demo-seed";
import {
  MEMBER_ROLE,
  OWNER_ROLE,
  VIEWER_ROLE,
  capabilitiesFor,
} from "@/lib/membership/capabilities";

import {
  SESSION_COOKIE,
  type SyntheticMember,
  endSyntheticMember,
  startSyntheticMember,
} from "../e2e/support/session";
import { BETTER_AUTH_SECRET, authAt } from "./auth";
import { SOME_DAY, appPool } from "./support";

// ADR 0012, amendment of 2026-11-23: E2E signs an account in by writing its rows and signing the
// session cookie itself. These tests keep that cookie in step with Better Auth: if an upgrade
// changes how it reads one, they fail here rather than as a confusing E2E failure.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "local", signUp: false });
const started: SyntheticMember[] = [];

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
});

afterEach(async () => {
  for (const member of started.splice(0)) await endSyntheticMember(pool, member);
});

afterAll(async () => {
  await pool.end();
});

async function start(role: string) {
  const member = await startSyntheticMember(pool, { secret: BETTER_AUTH_SECRET, role });
  started.push(member);
  return member;
}

const sessionFor = (member: SyntheticMember) =>
  auth.api.getSession({
    headers: new Headers({ cookie: `${SESSION_COOKIE}=${member.cookie}` }),
  });

describe("a synthetic member's session", () => {
  it.each([OWNER_ROLE, MEMBER_ROLE, VIEWER_ROLE])(
    "is read by Better Auth for a %s, in their organization",
    async (role) => {
      const member = await start(role);

      const session = await sessionFor(member);

      expect(session?.user.id).toBe(member.userId);
      expect(session?.user.email).toMatch(/@squadio\.example$/);
      expect(session?.session.activeOrganizationId).toBe(member.organizationId);
      await expect(
        memberOf(app, {
          userId: member.userId,
          activeOrganizationId: member.organizationId,
        }),
      ).resolves.toEqual({
        userId: member.userId,
        organizationId: member.organizationId,
        capabilities: capabilitiesFor(role),
      });
    },
  );

  it("is refused with a cookie signed by another secret", async () => {
    const member = await startSyntheticMember(pool, {
      secret: "another-synthetic-secret-0123456789abcdef",
      role: OWNER_ROLE,
    });
    started.push(member);

    await expect(sessionFor(member)).resolves.toBeNull();
  });

  it("leaves nothing behind, and never touches the demo", async () => {
    const member = await startSyntheticMember(pool, {
      secret: BETTER_AUTH_SECRET,
      role: OWNER_ROLE,
    });
    expect(member.organizationId).not.toBe(DEMO_ORGANIZATION_ID);
    await endSyntheticMember(pool, member);

    const left = await pool.query<{ users: number; organizations: number; demo: number }>(
      `select (select count(*)::int from auth."user" where id = $1) as users,
              (select count(*)::int from auth.organization where id = $2) as organizations,
              (select count(*)::int from auth.organization where id = $3) as demo`,
      [member.userId, member.organizationId, DEMO_ORGANIZATION_ID],
    );
    expect(left.rows[0]).toEqual({ users: 0, organizations: 0, demo: 1 });
  });

  it("joins another member's organization, and ending it leaves that organization", async () => {
    const owner = await start(OWNER_ROLE);
    const joined = await startSyntheticMember(pool, {
      secret: BETTER_AUTH_SECRET,
      role: VIEWER_ROLE,
      into: owner,
    });

    expect((await sessionFor(joined))?.session.activeOrganizationId).toBe(owner.organizationId);
    await expect(
      memberOf(app, { userId: joined.userId, activeOrganizationId: owner.organizationId }),
    ).resolves.toEqual({
      userId: joined.userId,
      organizationId: owner.organizationId,
      capabilities: capabilitiesFor(VIEWER_ROLE),
    });

    await endSyntheticMember(pool, joined);
    const left = await pool.query<{ users: number; organizations: number }>(
      `select (select count(*)::int from auth."user" where id = $1) as users,
              (select count(*)::int from auth.organization where id = $2) as organizations`,
      [joined.userId, owner.organizationId],
    );
    expect(left.rows[0]).toEqual({ users: 0, organizations: 1 });
  });
});
