// @vitest-environment node
// A person holds no money, but writing one moves rule j's count, so the server asks for the
// signed-in member's rate access; the member's organization comes from the session, never the form.
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Capabilities } from "@/lib/membership/capabilities";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string; activeOrganizationId: null },
  member: null as null | { organizationId: string; capabilities: Capabilities },
  createPerson: vi.fn(),
  updatePerson: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/access", async (original) => ({
  ...(await original<typeof import("@/db/access")>()),
  memberOf: async () => mocks.member,
}));
vi.mock("@/db/people", () => ({
  createPerson: mocks.createPerson,
  updatePerson: mocks.updatePerson,
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));

const { savePerson } = await import("./actions");

const organizationId = "0b5e0c1e-0000-4000-8000-000000000002";
const categoryId = "0b5e0c1e-0000-4000-8000-000000000003";
const personId = "0b5e0c1e-0000-4000-8000-000000000005";
const initial = { saved: null, error: null, errors: {} };

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const pablo = {
  name: " Pablo Ruiz ",
  categoryId,
  weeklyHours: "37,5",
  area: "",
  active: "on",
  locale: "es",
};

const saved = {
  name: "Pablo Ruiz",
  categoryId,
  weeklyHours: 37.5,
  area: null,
  active: true,
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
  mocks.createPerson.mockReset();
  mocks.updatePerson.mockReset();
  mocks.refresh.mockReset();
});

describe("savePerson", () => {
  it("creates a person in the member's organization and refreshes the page", async () => {
    mocks.createPerson.mockResolvedValue({ ok: true, personId });
    const state = await savePerson(initial, form(pablo));
    expect(mocks.createPerson).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      saved,
    );
    expect(state).toEqual({ saved: "Pablo Ruiz", error: null, errors: {} });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("edits the person the form names", async () => {
    mocks.updatePerson.mockResolvedValue({ ok: true });
    await savePerson(initial, form({ ...pablo, personId }));
    expect(mocks.updatePerson).toHaveBeenCalledWith(
      { client: "app" },
      { organizationId, rateAccess: true, readOnly: false },
      personId,
      saved,
    );
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("says which fields are wrong without touching the database", async () => {
    const state = await savePerson(initial, form({ ...pablo, name: "", weeklyHours: "200" }));
    expect(state.errors).toEqual({ name: "blank", weeklyHours: "invalid" });
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("refuses a person id that is not one", async () => {
    const state = await savePerson(initial, form({ ...pablo, personId: "Pablo" }));
    expect(state.error).toBe("not-found");
    expect(mocks.updatePerson).not.toHaveBeenCalled();
  });

  it("refuses a signed-out request and an account without an organization", async () => {
    mocks.session = null;
    expect((await savePerson(initial, form(pablo))).error).toBe("signed-out");
    mocks.session = { userId: "u", sessionId: "s", activeOrganizationId: null };
    mocks.member = null;
    expect((await savePerson(initial, form(pablo))).error).toBe("no-organization");
    expect(mocks.createPerson).not.toHaveBeenCalled();
  });

  it("passes on what the database refuses, without refreshing", async () => {
    mocks.member = {
      organizationId,
      capabilities: { rateAccess: false, edit: true, choose: false, manage: false },
    };
    mocks.createPerson.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect((await savePerson(initial, form(pablo))).error).toBe("no-rate-access");
    expect(mocks.createPerson.mock.calls[0]?.[1]).toEqual({
      organizationId,
      rateAccess: false,
      readOnly: false,
    });
    mocks.updatePerson.mockResolvedValue({ ok: false, reason: "category-not-found" });
    expect((await savePerson(initial, form({ ...pablo, personId }))).errors).toEqual({
      categoryId: "invalid",
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("says it failed when the database does, without logging the values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.createPerson.mockRejectedValue(new Error("Pablo Ruiz"));
    expect((await savePerson(initial, form(pablo))).error).toBe("failed");
    expect(log).toHaveBeenCalledWith("savePerson failed: Error");
    log.mockRestore();
  });
});
