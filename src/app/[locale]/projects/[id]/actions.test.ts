// @vitest-environment node
// ADR 0005: a category's rate is restricted, so the server checks the signed-in member's rate
// access before writing; the member's organization comes from the session, never the form.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string; activeOrganizationId: null },
  member: null as null | { organizationId: string; capabilities: { rateAccess: boolean } },
  createCategory: vi.fn(),
  updateCategory: vi.fn(),
  refresh: vi.fn(),
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

const { saveCategory } = await import("./actions");

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
  mocks.member = { organizationId, capabilities: { rateAccess: true } };
  mocks.createCategory.mockReset();
  mocks.updateCategory.mockReset();
  mocks.refresh.mockReset();
});

describe("saveCategory", () => {
  it("creates a category in the member's organization and refreshes the page", async () => {
    mocks.createCategory.mockResolvedValue({ ok: true, categoryId });
    const state = await saveCategory(initial, form(devOps));
    expect(mocks.createCategory).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true },
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
      { organizationId, rateAccess: true },
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
    mocks.member = { organizationId, capabilities: { rateAccess: false } };
    mocks.createCategory.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect((await saveCategory(initial, form(devOps))).error).toBe("no-rate-access");
    expect(mocks.createCategory.mock.calls[0]?.[1]).toEqual({ organizationId, rateAccess: false });
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
