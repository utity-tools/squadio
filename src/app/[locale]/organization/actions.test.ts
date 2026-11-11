// @vitest-environment node
// ADR 0012, "Starting an organization" and "Deleting": the organization page's Server Actions
// validate the name, act for the session the server reads, take the copy from the cookie and clear
// it once adopted, and delete only what the session's account owns.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string },
  cookies: { get: vi.fn(), delete: vi.fn() },
  createEmptyOrganization: vi.fn(),
  adoptVisitorCopy: vi.fn(),
  deleteMemberOrganization: vi.fn(),
  deleteAccount: vi.fn(),
  refresh: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/start-organization", () => ({
  createEmptyOrganization: mocks.createEmptyOrganization,
  adoptVisitorCopy: mocks.adoptVisitorCopy,
}));

vi.mock("@/db/delete-organization", () => ({
  deleteMemberOrganization: mocks.deleteMemberOrganization,
  deleteAccount: mocks.deleteAccount,
}));
vi.mock("@/i18n/locale", () => ({ currentLocale: async () => "es" }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { adoptVisitorsCopy, deleteOrganization, deleteOwnAccount, startEmptyOrganization } =
  await import("./actions");

const starter = { userId: "0b5e0c1e-0000-4000-8000-000000000001", sessionId: "s" };
const named = (name: unknown) => {
  const form = new FormData();
  if (typeof name === "string") form.set("name", name);
  return form;
};
const initial = { error: null };

beforeEach(() => {
  mocks.session = starter;
  for (const mock of [
    mocks.createEmptyOrganization,
    mocks.adoptVisitorCopy,
    mocks.deleteMemberOrganization,
    mocks.deleteAccount,
    mocks.refresh,
    mocks.redirect,
    mocks.cookies.get,
    mocks.cookies.delete,
  ]) {
    mock.mockReset();
  }
});

describe("startEmptyOrganization", () => {
  it("creates it for the session's account with the trimmed name, and reloads the page", async () => {
    mocks.createEmptyOrganization.mockResolvedValue({ ok: true, organizationId: "o" });
    expect(await startEmptyOrganization(initial, named("  Synthetic Consulting "))).toEqual({
      error: null,
    });
    expect(mocks.createEmptyOrganization).toHaveBeenCalledWith(
      { client: "app" },
      expect.objectContaining(starter),
      "Synthetic Consulting",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("refuses a blank, missing or too long name without touching the database", async () => {
    expect(await startEmptyOrganization(initial, named("   "))).toEqual({ error: "blank" });
    expect(await startEmptyOrganization(initial, named(undefined))).toEqual({ error: "blank" });
    expect(await startEmptyOrganization(initial, named("a".repeat(101)))).toEqual({
      error: "too-long",
    });
    expect(mocks.createEmptyOrganization).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    mocks.session = null;
    expect(await startEmptyOrganization(initial, named("Synthetic"))).toEqual({
      error: "signed-out",
    });
    expect(mocks.createEmptyOrganization).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    mocks.createEmptyOrganization.mockRejectedValue(
      Object.assign(new Error("secret"), { code: "23505" }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await startEmptyOrganization(initial, named("Synthetic"))).toEqual({ error: "failed" });
    expect(log).toHaveBeenCalledWith("startEmpty failed: Error 23505");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("adoptVisitorsCopy", () => {
  it("adopts the cookie's copy, then clears the cookie and reloads the page", async () => {
    mocks.cookies.get.mockReturnValue({ value: "token" });
    mocks.adoptVisitorCopy.mockResolvedValue({ ok: true, organizationId: "o" });
    expect(await adoptVisitorsCopy(initial, named("Squadio example"))).toEqual({ error: null });
    expect(mocks.adoptVisitorCopy).toHaveBeenCalledWith(
      { client: "app" },
      expect.objectContaining(starter),
      "token",
      "Squadio example",
    );
    expect(mocks.cookies.delete).toHaveBeenCalledWith("squadio_visitor");
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("keeps the cookie and says so when there is no copy to adopt", async () => {
    mocks.adoptVisitorCopy.mockResolvedValue({ ok: false, reason: "no-copy" });
    expect(await adoptVisitorsCopy(initial, named("Squadio example"))).toEqual({
      error: "no-copy",
    });
    expect(mocks.cookies.delete).not.toHaveBeenCalled();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteOrganization", () => {
  it("deletes the session's organization and reloads the page", async () => {
    mocks.deleteMemberOrganization.mockResolvedValue({ ok: true, organizationId: "o" });
    expect(await deleteOrganization()).toEqual({ error: null });
    expect(mocks.deleteMemberOrganization).toHaveBeenCalledWith({ client: "app" }, starter);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("says so when the account owns no organization", async () => {
    mocks.deleteMemberOrganization.mockResolvedValue({ ok: false, reason: "no-organization" });
    expect(await deleteOrganization()).toEqual({ error: "no-organization" });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refuses without a session", async () => {
    mocks.session = null;
    expect(await deleteOrganization()).toEqual({ error: "signed-out" });
    expect(mocks.deleteMemberOrganization).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    mocks.deleteMemberOrganization.mockRejectedValue(
      Object.assign(new Error("secret"), { code: "23503" }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteOrganization()).toEqual({ error: "failed" });
    expect(log).toHaveBeenCalledWith("deleteOrganization failed: Error 23503");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("deleteOwnAccount", () => {
  it("deletes the session's account and leads to the landing", async () => {
    mocks.deleteAccount.mockResolvedValue({ deletedOrganizations: ["o"] });
    await deleteOwnAccount();
    expect(mocks.deleteAccount).toHaveBeenCalledWith({ client: "app" }, starter.userId);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/", locale: "es" });
  });

  it("refuses without a session", async () => {
    mocks.session = null;
    expect(await deleteOwnAccount()).toEqual({ error: "signed-out" });
    expect(mocks.deleteAccount).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error and stays on the page", async () => {
    mocks.deleteAccount.mockRejectedValue(new Error("secret"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await deleteOwnAccount()).toEqual({ error: "failed" });
    expect(log).toHaveBeenCalledWith("deleteAccount failed: Error");
    expect(mocks.redirect).not.toHaveBeenCalled();
  });
});
