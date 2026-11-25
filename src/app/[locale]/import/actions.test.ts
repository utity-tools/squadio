// @vitest-environment node
// ADR 0016: the import's Server Action gets the matched rows, never the file. Who imports, and
// into which organization, comes from the session; a viewer is refused before any write.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Capabilities } from "@/lib/membership/capabilities";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string; activeOrganizationId: null },
  member: null as null | { organizationId: string; capabilities: Capabilities },
  importCategories: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/access", async (original) => ({
  ...(await original<typeof import("@/db/access")>()),
  memberOf: async () => mocks.member,
}));
vi.mock("@/db/import-categories", () => ({ importCategories: mocks.importCategories }));

const { importCategoriesFile } = await import("./actions");

const organizationId = "0b5e0c1e-0000-4000-8000-000000000002";
const owner: Capabilities = { rateAccess: true, edit: true, choose: true, manage: true };
const viewer: Capabilities = { rateAccess: false, edit: false, choose: false, manage: false };

const cells = {
  name: "QA Engineer",
  grossAnnualSalary: "38.000",
  socialSecurity: "",
  otherYearlyCosts: "",
  sellRate: "45",
  manualCostPerHour: "",
};
const input = { locale: "es", rows: [{ row: 2, cells, cellCountMatches: true }] };

beforeEach(() => {
  mocks.session = {
    userId: "0b5e0c1e-0000-4000-8000-000000000001",
    sessionId: "s",
    activeOrganizationId: null,
  };
  mocks.member = { organizationId, capabilities: owner };
  mocks.importCategories.mockReset();
  mocks.importCategories.mockResolvedValue({ ok: true, creates: 1, updates: 0 });
});

describe("importCategoriesFile", () => {
  it("imports the rows into the session's organization, with its rate access", async () => {
    expect(await importCategoriesFile(input)).toEqual({ ok: true, creates: 1, updates: 0 });
    expect(mocks.importCategories).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      input.rows,
      "es",
    );
  });

  it("refuses a shape it does not expect without reaching the database", async () => {
    const bad = [
      null,
      { ...input, locale: "fr" },
      { ...input, rows: [] },
      { ...input, organizationId: "someone-else" },
    ];
    for (const sent of bad) {
      expect(await importCategoriesFile(sent)).toEqual({ ok: false, error: "invalid" });
    }
    expect(mocks.importCategories).not.toHaveBeenCalled();
  });

  it("refuses a viewer without writing", async () => {
    mocks.member = { organizationId, capabilities: viewer };
    expect(await importCategoriesFile(input)).toEqual({ ok: false, error: "read-only" });
    expect(mocks.importCategories).not.toHaveBeenCalled();
  });

  it("refuses without a session or an organization", async () => {
    mocks.member = null;
    expect(await importCategoriesFile(input)).toEqual({ ok: false, error: "no-organization" });
    mocks.session = null;
    expect(await importCategoriesFile(input)).toEqual({ ok: false, error: "signed-out" });
    expect(mocks.importCategories).not.toHaveBeenCalled();
  });

  it("says when the rows no longer pass the check", async () => {
    mocks.importCategories.mockResolvedValue({ ok: false, reason: "rows-changed" });
    expect(await importCategoriesFile(input)).toEqual({ ok: false, error: "rows-changed" });
  });

  it("logs an unexpected error by its kind only and says it failed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.importCategories.mockRejectedValue(
      Object.assign(new Error("QA Engineer 38.000"), { code: "57014" }),
    );
    expect(await importCategoriesFile(input)).toEqual({ ok: false, error: "failed" });
    expect(log).toHaveBeenCalledWith("importCategories failed: Error 57014");
    log.mockRestore();
  });
});
