import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memberOf } from "@/db/access";
import { DEMO_IDS, seedDemo } from "@/db/demo-seed";
import { loadOrganizationOverview } from "@/db/organization-overview";
import { createEmptyOrganization } from "@/db/start-organization";
import { copyId } from "@/lib/visitors/copy-id";

import { authAt, emailFor, signInOnPreview } from "./auth";
import { type TestMember, ownerOfACopy, sessionOf } from "./members";
import { SOME_DAY, appPool } from "./support";

// ADR 0012: the organization page shows a member their own organization's structure, and only it.

const pool = appPool(2);
const app = drizzle(pool);
const auth = authAt(app, { at: "preview", signUp: true });

let ada: TestMember;
let bob: TestMember;

beforeAll(async () => {
  await seedDemo(app, SOME_DAY);
  ada = await ownerOfACopy(pool, app, auth, "ada");
  bob = await ownerOfACopy(pool, app, auth, "bob");
});

afterAll(async () => {
  await pool.query(`delete from auth."user" where email = any($1)`, [[ada.email, bob.email]]);
  await pool.end();
});

describe("loadOrganizationOverview", () => {
  it("lists the member's own projects and scenarios, under their organization's name", async () => {
    const member = await memberOf(app, await sessionOf(auth, ada));
    if (!member) throw new Error("expected Ada's membership");
    const overview = await loadOrganizationOverview(app, member);

    expect(overview?.name).toBe("Synthetic organization");
    expect(overview?.example).toBe(false);
    const ids = overview?.projects.flatMap((project) => [
      project.id,
      ...project.scenarios.map((scenario) => scenario.id),
    ]);
    expect(ids).toContain(copyId(DEMO_IDS.project, ada.organizationId));
    expect(ids).toContain(copyId(DEMO_IDS.guideScenario, ada.organizationId));
    expect(ids).not.toContain(copyId(DEMO_IDS.guideScenario, bob.organizationId));
    expect(ids).not.toContain(DEMO_IDS.guideScenario);
    const guide = overview?.projects
      .flatMap((project) => project.scenarios)
      .find((scenario) => scenario.id === copyId(DEMO_IDS.guideScenario, ada.organizationId));
    expect(guide).toEqual({
      id: copyId(DEMO_IDS.guideScenario, ada.organizationId),
      name: "Plan A",
      chosen: expect.any(Boolean),
    });
  });

  it("shows an empty organization with no projects", async () => {
    const email = emailFor("empty");
    const cookie = await signInOnPreview(auth, email);
    try {
      const session = await auth.api.getSession({ headers: new Headers({ cookie }) });
      if (!session) throw new Error("expected a session");
      const created = await createEmptyOrganization(
        app,
        { userId: session.user.id, sessionId: session.session.id },
        "Synthetic Consulting",
      );
      if (!created.ok) throw new Error("expected an organization");
      const member = await memberOf(app, { userId: session.user.id });
      if (!member) throw new Error("expected the membership");

      expect(await loadOrganizationOverview(app, member)).toEqual({
        name: "Synthetic Consulting",
        example: false,
        projects: [],
      });
    } finally {
      await pool.query(`delete from auth."user" where email = $1`, [email]);
    }
  });
});
