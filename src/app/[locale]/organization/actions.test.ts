// @vitest-environment node
// ADR 0012, "Starting an organization": the organization page's Server Actions validate the name,
// act for the session the server reads, take the copy from the cookie and clear it once adopted.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string },
  cookies: { get: vi.fn(), delete: vi.fn() },
  createEmptyOrganization: vi.fn(),
  adoptVisitorCopy: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/start-organization", () => ({
  createEmptyOrganization: mocks.createEmptyOrganization,
  adoptVisitorCopy: mocks.adoptVisitorCopy,
}));

const { adoptVisitorsCopy, startEmptyOrganization } = await import("./actions");

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
    mocks.refresh,
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
