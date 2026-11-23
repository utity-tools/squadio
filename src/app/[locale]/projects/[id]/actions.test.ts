// @vitest-environment node
// ADR 0005: a category's rate is restricted, so the server checks the signed-in member's rate
// access before writing; the member's organization comes from the session, never the form.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Capabilities } from "@/lib/membership/capabilities";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string; activeOrganizationId: null },
  member: null as null | { organizationId: string; capabilities: Capabilities },
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  refresh: vi.fn(),
  createScenario: vi.fn(),
  updateProject: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/access", async (original) => ({
  ...(await original<typeof import("@/db/access")>()),
  memberOf: async () => mocks.member,
}));
vi.mock("@/db/categories", () => ({
  createCategory: mocks.createCategory,
  updateCategory: mocks.updateCategory,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/create-scenario", () => ({ createScenario: mocks.createScenario }));
vi.mock("@/db/create-project", () => ({ updateProject: mocks.updateProject }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { createNewScenario, editProject, saveCategory } = await import("./actions");

const organizationId = "0b5e0c1e-0000-4000-8000-000000000002";
const categoryId = "0b5e0c1e-0000-4000-8000-000000000003";
const initial = { saved: null, error: null, errors: {} };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const devOps = {
  name: " DevOps Engineer ",
  salaryPeriod: "month",
  salary: "2.100",
  payments: "14",
  socialSecurity: "31",
  otherCosts: "3.000",
  manualCostPerHour: "",
  sellRate: "62",
  locale: "es",
};

const rate = {
  grossAnnualSalaryCents: 2_940_000,
  socialSecurityBasisPoints: 3100,
  otherYearlyCostsCents: 300_000,
  manualCostPerHourCents: null,
  sellRateCents: 6200,
};

beforeEach(() => {
  mocks.session = {
    userId: "0b5e0c1e-0000-4000-8000-000000000001",
    sessionId: "s",
    activeOrganizationId: null,
  };
  mocks.member = {
    organizationId,
    capabilities: { rateAccess: true, edit: true, choose: true, manage: true },
  };
  mocks.createCategory.mockReset();
  mocks.updateCategory.mockReset();
  mocks.refresh.mockReset();
  mocks.createScenario.mockReset();
  mocks.updateProject.mockReset();
  mocks.redirect.mockReset();
});

describe("saveCategory", () => {
  it("creates a category in the member's organization and refreshes the page", async () => {
    mocks.createCategory.mockResolvedValue({ ok: true, categoryId });
    const state = await saveCategory(initial, form(devOps));
    expect(mocks.createCategory).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      { name: "DevOps Engineer", rate },
    );
    expect(state).toEqual({ saved: "DevOps Engineer", error: null, errors: {} });
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("edits the category the form names", async () => {
    mocks.updateCategory.mockResolvedValue({ ok: true });
    await saveCategory(initial, form({ ...devOps, categoryId }));
    expect(mocks.updateCategory).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      categoryId,
      { name: "DevOps Engineer", rate },
    );
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("reads amounts in the form's locale", async () => {
    mocks.createCategory.mockResolvedValue({ ok: true, categoryId });
    await saveCategory(
      initial,
      form({ ...devOps, salary: "2,100.50", otherCosts: "3,000", locale: "en" }),
    );
    expect(mocks.createCategory.mock.calls[0]?.[2].rate.grossAnnualSalaryCents).toBe(2_940_700);
  });

  it("says which fields are wrong without touching the database", async () => {
    const state = await saveCategory(initial, form({ ...devOps, name: " ", sellRate: "abc" }));
    expect(state).toEqual({
      saved: null,
      error: null,
      errors: { name: "blank", sellRate: "invalid" },
    });
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("refuses a category id that is not one", async () => {
    expect((await saveCategory(initial, form({ ...devOps, categoryId: "x" }))).error).toBe(
      "not-found",
    );
    expect(mocks.updateCategory).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request and an account without an organization", async () => {
    mocks.session = null;
    expect((await saveCategory(initial, form(devOps))).error).toBe("signed-out");
    mocks.session = { userId: "u", sessionId: "s", activeOrganizationId: null };
    mocks.member = null;
    expect((await saveCategory(initial, form(devOps))).error).toBe("no-organization");
    expect(mocks.createCategory).not.toHaveBeenCalled();
  });

  it("passes on what the database refuses, without refreshing", async () => {
    mocks.member = {
      organizationId,
      capabilities: { rateAccess: false, edit: true, choose: false, manage: false },
    };
    mocks.createCategory.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect((await saveCategory(initial, form(devOps))).error).toBe("no-rate-access");
    expect(mocks.createCategory.mock.calls[0]?.[1]).toEqual({
      organizationId,
      rateAccess: false,
      readOnly: false,
    });
    mocks.updateCategory.mockResolvedValue({ ok: false, reason: "name-taken" });
    expect((await saveCategory(initial, form({ ...devOps, categoryId }))).errors).toEqual({
      name: "taken",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says it failed when the database does, without logging the values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createCategory.mockRejectedValue(new Error("DevOps Engineer"));
    expect((await saveCategory(initial, form(devOps))).error).toBe("failed");
    expect(log).toHaveBeenCalledWith("saveCategory failed: Error");
    log.mockRestore();
  });
});

const projectId = "0b5e0c1e-0000-4000-8000-000000000004";

describe("createNewScenario", () => {
  it("creates the project's next scenario, named in the form's locale, and opens it", async () => {
    mocks.member = {
      organizationId,
      capabilities: { rateAccess: false, edit: true, choose: false, manage: false },
    };
    mocks.createScenario.mockResolvedValue({ ok: true, scenarioId: "s" });
    await createNewScenario({ error: null }, form({ projectId, locale: "en" }));
    expect(mocks.createScenario).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: false, readOnly: false },
      projectId,
      "Scenario",
    );
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/scenarios/s", locale: "en" });
  });

  it("refuses a project id that is not one, or a project of another organization", async () => {
    expect(await createNewScenario({ error: null }, form({ projectId: "x" }))).toEqual({
      error: "not-found",
    });
    mocks.createScenario.mockResolvedValue({ ok: false, reason: "not-found" });
    expect(await createNewScenario({ error: null }, form({ projectId }))).toEqual({
      error: "not-found",
    });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request and an account without an organization", async () => {
    mocks.session = null;
    expect((await createNewScenario({ error: null }, form({ projectId }))).error).toBe(
      "signed-out",
    );
    mocks.session = { userId: "u", sessionId: "s", activeOrganizationId: null };
    mocks.member = null;
    expect((await createNewScenario({ error: null }, form({ projectId }))).error).toBe(
      "no-organization",
    );
    expect(mocks.createScenario).not.toHaveBeenCalled();
  });

  it("says it failed when the database does, without logging the values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createScenario.mockRejectedValue(new Error("Client portal"));
    expect((await createNewScenario({ error: null }, form({ projectId }))).error).toBe("failed");
    expect(log).toHaveBeenCalledWith("createScenario failed: Error");
    log.mockRestore();
  });
});

describe("editProject", () => {
  const projectId = "0b5e0c1e-0000-4000-8000-000000000004";
  const unsaved = { saved: false, error: null, errors: {} };
  const portal = {
    projectId,
    name: "Client portal",
    client: "Synthetic Bank",
    pricingModel: "fixed",
    price: "1,500.50",
    plannedStart: "2027-04-01",
    plannedEnd: "2027-09-30",
    description: "A portal.",
    locale: "en",
  };

  it("saves the form over the project in the member's organization, then refreshes", async () => {
    mocks.updateProject.mockResolvedValue({ ok: true });
    expect(await editProject(unsaved, form(portal))).toEqual({
      saved: true,
      error: null,
      errors: {},
    });
    expect(mocks.updateProject).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      projectId,
      {
        name: "Client portal",
        client: "Synthetic Bank",
        pricingModel: "fixed",
        priceCents: 150050,
        plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
        description: "A portal.",
      },
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("says which fields are wrong without touching the database", async () => {
    const state = await editProject(unsaved, form({ ...portal, plannedEnd: "" }));
    expect(state).toEqual({ saved: false, error: null, errors: { plannedEnd: "incomplete" } });
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("finds no project behind an id that is not a UUID", async () => {
    expect((await editProject(unsaved, form({ ...portal, projectId: "p" }))).error).toBe(
      "not-found",
    );
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request and an account without an organization", async () => {
    mocks.session = null;
    expect((await editProject(unsaved, form(portal))).error).toBe("signed-out");
    mocks.session = { userId: "u", sessionId: "s", activeOrganizationId: null };
    mocks.member = null;
    expect((await editProject(unsaved, form(portal))).error).toBe("no-organization");
    expect(mocks.updateProject).not.toHaveBeenCalled();
  });

  it("passes on why the database did not save it", async () => {
    mocks.updateProject.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect((await editProject(unsaved, form(portal))).error).toBe("no-rate-access");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says it failed when the database does, without logging the values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.updateProject.mockRejectedValue(new Error("Synthetic Bank"));
    expect((await editProject(unsaved, form(portal))).error).toBe("failed");
    expect(log).toHaveBeenCalledWith("updateProject failed: Error");
    log.mockRestore();
  });
});
