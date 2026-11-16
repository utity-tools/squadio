// @vitest-environment node
// ADR 0005: creating a project writes its pricing row, so the server checks the signed-in member's
// rate access before writing; the member's organization comes from the session, never the form.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string; activeOrganizationId: null },
  member: null as null | { organizationId: string; capabilities: { rateAccess: boolean } },
  createProject: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/access", async (original) => ({
  ...(await original<typeof import("@/db/access")>()),
  memberOf: async () => mocks.member,
}));
vi.mock("@/db/create-project", () => ({ createProject: mocks.createProject }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { createNewProject } = await import("./actions");

const organizationId = "0b5e0c1e-0000-4000-8000-000000000002";
const initial = { error: null, errors: {} };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const fixed = {
  name: " Client portal ",
  client: "Synthetic Bank",
  pricingModel: "fixed",
  price: "200.000,00",
  locale: "es",
};

beforeEach(() => {
  mocks.session = {
    userId: "0b5e0c1e-0000-4000-8000-000000000001",
    sessionId: "s",
    activeOrganizationId: null,
  };
  mocks.member = { organizationId, capabilities: { rateAccess: true } };
  mocks.createProject.mockReset();
  mocks.redirect.mockReset();
});

describe("createNewProject", () => {
  it("creates it in the member's organization and leads to its page", async () => {
    mocks.createProject.mockResolvedValue({ ok: true, projectId: "p" });
    await createNewProject(initial, form(fixed));
    expect(mocks.createProject).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true },
      { name: "Client portal", client: "Synthetic Bank", pricingModel: "fixed", priceCents: 2e7 },
    );
    expect(mocks.redirect).toHaveBeenCalledWith({
      href: "/projects/p",
      locale: "es",
    });
  });

  it("reads the price and leads back in the form's locale", async () => {
    mocks.createProject.mockResolvedValue({ ok: true, projectId: "p" });
    await createNewProject(initial, form({ ...fixed, price: "1,500.50", locale: "en" }));
    expect(mocks.createProject.mock.calls[0]?.[2]).toMatchObject({ priceCents: 150050 });
    expect(mocks.redirect.mock.calls[0]?.[0]).toMatchObject({ locale: "en" });
  });

  it("says which fields are wrong without touching the database", async () => {
    const state = await createNewProject(initial, form({ ...fixed, name: " ", price: "abc" }));
    expect(state).toEqual({ error: null, errors: { name: "blank", price: "invalid" } });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request", async () => {
    mocks.session = null;
    expect(await createNewProject(initial, form(fixed))).toEqual({
      error: "signed-out",
      errors: {},
    });
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("refuses an account without an organization", async () => {
    mocks.member = null;
    expect((await createNewProject(initial, form(fixed))).error).toBe("no-organization");
    expect(mocks.createProject).not.toHaveBeenCalled();
  });

  it("refuses a member without rate access", async () => {
    mocks.member = { organizationId, capabilities: { rateAccess: false } };
    mocks.createProject.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect((await createNewProject(initial, form(fixed))).error).toBe("no-rate-access");
    expect(mocks.createProject.mock.calls[0]?.[1]).toEqual({ organizationId, rateAccess: false });
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("says it failed when the database does, without logging the values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createProject.mockRejectedValue(new Error("Synthetic Bank"));
    expect((await createNewProject(initial, form(fixed))).error).toBe("failed");
    expect(log).toHaveBeenCalledWith("createProject failed: Error");
    expect(mocks.redirect).not.toHaveBeenCalled();
    log.mockRestore();
  });
});
