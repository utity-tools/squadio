// @vitest-environment node
// ADR 0015, amendment of 2026-11-23 (slice 4b): the members page's Server Actions validate the
// email and the role, act for the session the server reads, and leave who is the owner to the
// database code, which checks it again inside the transaction.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  session: null as null | {
    userId: string;
    sessionId: string;
    activeOrganizationId: string | null;
  },
  inviteToOrganization: vi.fn(),
  revokeInvitation: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/auth/session", () => ({ currentSession: async () => mocks.session }));
vi.mock("@/db/invitations", () => ({
  inviteToOrganization: mocks.inviteToOrganization,
  revokeInvitation: mocks.revokeInvitation,
}));

const { inviteMember, revokeMemberInvitation } = await import("./actions");

const session = {
  userId: "0b5e0c1e-0000-4000-8000-000000000001",
  sessionId: "0b5e0c1e-0000-4000-8000-000000000002",
  activeOrganizationId: "0b5e0c1e-0000-4000-8000-000000000003",
};
const invitationId = "0b5e0c1e-0000-4000-8000-000000000300";
const initial = { error: null, invitationId: null, values: null };

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
};

beforeEach(() => {
  mocks.session = session;
  for (const mock of [mocks.inviteToOrganization, mocks.revokeInvitation, mocks.refresh]) {
    mock.mockReset();
  }
});

describe("inviteMember", () => {
  it("invites the email trimmed and in lower case, with its role, and reloads the page", async () => {
    mocks.inviteToOrganization.mockResolvedValue({ ok: true, invitationId });

    const state = await inviteMember(
      initial,
      form({ email: " Ada@Squadio.Example ", role: "viewer" }),
    );

    expect(state).toEqual({ error: null, invitationId, values: null });
    expect(mocks.inviteToOrganization).toHaveBeenCalledWith({ client: "app" }, session, {
      email: "ada@squadio.example",
      role: "viewer",
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each<[Record<string, string>, string]>([
    [{ email: "", role: "member" }, "blank"],
    [{ email: "ada", role: "member" }, "invalid"],
    [{ email: `${"a".repeat(250)}@x.example`, role: "member" }, "too-long"],
    [{ email: "ada@squadio.example", role: "owner" }, "role"],
    [{ email: "ada@squadio.example" }, "role"],
  ])("refuses %j as %s without touching the database", async (fields, error) => {
    expect(await inviteMember(initial, form(fields))).toEqual({
      error,
      invitationId: null,
      values: { email: fields.email, role: fields.role ?? "" },
    });
    expect(mocks.inviteToOrganization).not.toHaveBeenCalled();
  });

  it("refuses when signed out", async () => {
    mocks.session = null;

    expect(
      await inviteMember(initial, form({ email: "ada@squadio.example", role: "member" })),
    ).toEqual({
      error: "signed-out",
      invitationId: null,
      values: { email: "ada@squadio.example", role: "member" },
    });
    expect(mocks.inviteToOrganization).not.toHaveBeenCalled();
  });

  it.each(["not-owner", "member", "limit"])("says why the database refused: %s", async (reason) => {
    mocks.inviteToOrganization.mockResolvedValue({ ok: false, reason });

    expect(
      await inviteMember(initial, form({ email: "ada@squadio.example", role: "member" })),
    ).toEqual({
      error: reason,
      invitationId: null,
      values: { email: "ada@squadio.example", role: "member" },
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("points at the invitation already pending for the email", async () => {
    mocks.inviteToOrganization.mockResolvedValue({ ok: false, reason: "pending", invitationId });

    expect(
      await inviteMember(initial, form({ email: "ada@squadio.example", role: "member" })),
    ).toEqual({
      error: "pending",
      invitationId,
      values: { email: "ada@squadio.example", role: "member" },
    });
  });

  it("fails without telling the error's values", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.inviteToOrganization.mockRejectedValue(new Error("ada@squadio.example"));

    expect(
      await inviteMember(initial, form({ email: "ada@squadio.example", role: "member" })),
    ).toEqual({
      error: "failed",
      invitationId: null,
      values: { email: "ada@squadio.example", role: "member" },
    });
    expect(log).toHaveBeenCalledWith("inviteMember failed: Error");
    log.mockRestore();
  });
});

describe("revokeMemberInvitation", () => {
  it("revokes the form's invitation for the session's account, and reloads the page", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: true });

    expect(await revokeMemberInvitation({ error: null }, form({ invitationId }))).toEqual({
      error: null,
    });
    expect(mocks.revokeInvitation).toHaveBeenCalledWith({ client: "app" }, session, invitationId);
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it.each(["not-owner", "not-found"])("says why the database refused: %s", async (reason) => {
    mocks.revokeInvitation.mockResolvedValue({ ok: false, reason });

    expect(await revokeMemberInvitation({ error: null }, form({ invitationId }))).toEqual({
      error: reason,
    });
  });

  it("refuses when signed out", async () => {
    mocks.session = null;

    expect(await revokeMemberInvitation({ error: null }, form({ invitationId }))).toEqual({
      error: "signed-out",
    });
  });

  it("finds nothing for a form without an id", async () => {
    mocks.revokeInvitation.mockResolvedValue({ ok: false, reason: "not-found" });

    expect(await revokeMemberInvitation({ error: null }, form({}))).toEqual({ error: "not-found" });
    expect(mocks.revokeInvitation).toHaveBeenCalledWith({ client: "app" }, session, "");
  });
});
