// @vitest-environment node
// Design board 14 and ADR 0012: choosing another organization. The action checks the id, acts for
// the session the server reads, and refreshes the browser's cached pages once the switch is done.
// It reads no root params: Next.js forbids them in Server Actions.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string },
  switchOrganization: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/switch-organization", () => ({ switchOrganization: mocks.switchOrganization }));
vi.mock("next/root-params", () => ({
  locale: () => {
    throw new Error("root params are not supported inside a Server Action");
  },
}));

const { chooseOrganization } = await import("./actions");

const signedIn = { userId: "0b5e0c1e-0000-4000-8000-000000000001", sessionId: "s" };
const other = "0b5e0c1e-0000-4000-8000-0000000000aa";

beforeEach(() => {
  mocks.session = signedIn;
  mocks.switchOrganization.mockReset();
  mocks.refresh.mockReset();
});

describe("chooseOrganization", () => {
  it("switches the session's organization, then refreshes the cached pages", async () => {
    mocks.switchOrganization.mockResolvedValue(true);

    expect(await chooseOrganization(other)).toEqual({ ok: true });

    expect(mocks.switchOrganization).toHaveBeenCalledWith({ client: "app" }, signedIn, other);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each([["not-a-uuid"], [42], [null]])(
    "refuses %j without touching the database",
    async (id) => {
      expect(await chooseOrganization(id)).toEqual({ ok: false });
      expect(mocks.switchOrganization).not.toHaveBeenCalled();
    },
  );

  it("refuses a visitor without an account", async () => {
    mocks.session = null;

    expect(await chooseOrganization(other)).toEqual({ ok: false });
    expect(mocks.switchOrganization).not.toHaveBeenCalled();
  });

  it("refreshes nothing when the server refuses the switch", async () => {
    mocks.switchOrganization.mockResolvedValue(false);

    expect(await chooseOrganization(other)).toEqual({ ok: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("logs a database error by its kind only, and says it failed", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.switchOrganization.mockRejectedValue(new TypeError(`bad value ${other}`));

    expect(await chooseOrganization(other)).toEqual({ ok: false });
    expect(log).toHaveBeenCalledWith("chooseOrganization failed: TypeError");
    log.mockRestore();
  });
});
