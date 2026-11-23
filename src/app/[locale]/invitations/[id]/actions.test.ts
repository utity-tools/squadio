// @vitest-environment node
// ADR 0015, amendment of 2026-11-23 (slice 4b): accepting an invitation acts for the session the
// server reads, and leads to the organization page in the form's locale once it has joined.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | { userId: string; sessionId: string },
  acceptInvitation: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/accept-invitation", () => ({ acceptInvitation: mocks.acceptInvitation }));
vi.mock("@/i18n/navigation", () => ({ redirect: mocks.redirect }));

const { acceptMemberInvitation } = await import("./actions");

const session = {
  userId: "0b5e0c1e-0000-4000-8000-000000000001",
  sessionId: "0b5e0c1e-0000-4000-8000-000000000002",
};
const invitationId = "0b5e0c1e-0000-4000-8000-000000000300";
const initial = { error: null };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

beforeEach(() => {
  mocks.session = session;
  mocks.acceptInvitation.mockReset();
  mocks.redirect.mockReset();
});

describe("acceptMemberInvitation", () => {
  it("accepts for the session's account and leads to the organization page", async () => {
    mocks.acceptInvitation.mockResolvedValue({ ok: true, organizationId: "o" });

    await acceptMemberInvitation(initial, form({ invitationId, locale: "en" }));

    expect(mocks.acceptInvitation).toHaveBeenCalledWith({ client: "app" }, session, invitationId);
    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/organization", locale: "en" });
  });

  it("falls back to the default locale for one it does not know", async () => {
    mocks.acceptInvitation.mockResolvedValue({ ok: true, organizationId: "o" });

    await acceptMemberInvitation(initial, form({ invitationId, locale: "fr" }));

    expect(mocks.redirect).toHaveBeenCalledWith({ href: "/organization", locale: "es" });
  });

  it.each(["not-found", "used", "revoked", "expired", "unverified", "already-member"])(
    "says why it could not: %s",
    async (reason) => {
      mocks.acceptInvitation.mockResolvedValue({ ok: false, reason });

      expect(await acceptMemberInvitation(initial, form({ invitationId }))).toEqual({
        error: reason,
      });
      expect(mocks.redirect).not.toHaveBeenCalled();
    },
  );

  it("refuses when signed out", async () => {
    mocks.session = null;

    expect(await acceptMemberInvitation(initial, form({ invitationId }))).toEqual({
      error: "signed-out",
    });
    expect(mocks.acceptInvitation).not.toHaveBeenCalled();
  });

  it("fails without telling the error's values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.acceptInvitation.mockRejectedValue(new Error("grace@squadio.example"));

    expect(await acceptMemberInvitation(initial, form({ invitationId }))).toEqual({
      error: "failed",
    });
    expect(log).toHaveBeenCalledWith("acceptInvitation failed: Error");
    log.mockRestore();
  });
});
