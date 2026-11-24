// @vitest-environment node
// docs/domain.md, "Derived alternative": the Server Action validates its input and hands on who the
// request is, the session's member resolved on the server (ADR 0012) and the request's cookies,
// with the alternative's name in the page's locale.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: { get: vi.fn(), set: vi.fn() },
  member: { organizationId: "0b5e0c1e-0000-4000-8000-000000000001" } as unknown,
  deriveAlternativeFor: vi.fn(),
  chooseRevisionFor: vi.fn(),
  previewChoiceFor: vi.fn(),
  revalidatePath: vi.fn(),
  refresh: vi.fn(),
  visitor: { organizationId: "0b5e0c1e-0000-4000-8000-000000000002", rateAccess: true },
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath, refresh: mocks.refresh }));
vi.mock("@/db/request-access", () => ({
  currentMember: async () => mocks.member,
  currentAccessContext: async () => mocks.visitor,
}));
vi.mock("@/db/scenario-writes", () => ({
  deriveAlternativeFor: mocks.deriveAlternativeFor,
  chooseRevisionFor: mocks.chooseRevisionFor,
  previewChoiceFor: mocks.previewChoiceFor,
}));

const writer = { member: mocks.member, jar: mocks.cookies };

const { chooseRevision, previewChoice, proposeAlternative } = await import("./actions");

const revisionId = "6d656d6f-0000-4000-8000-000000000500";
const alternative = "6d656d6f-0000-4000-8000-000000000299";

beforeEach(() => {
  mocks.deriveAlternativeFor.mockReset();
  mocks.chooseRevisionFor.mockReset();
  mocks.previewChoiceFor.mockReset();
  mocks.revalidatePath.mockReset();
  mocks.refresh.mockReset();
});

describe("proposeAlternative", () => {
  it("derives for the request, with rate access, naming it in the page's locale", async () => {
    mocks.deriveAlternativeFor.mockResolvedValue({ ok: true, version: 1, scenarioId: alternative });
    expect(await proposeAlternative({ revisionId, locale: "es" })).toEqual({
      ok: true,
      version: 1,
      scenarioId: alternative,
    });
    const [db, who, request, options] = mocks.deriveAlternativeFor.mock.calls[0] ?? [];
    expect([db, who, request]).toEqual([{ client: "app" }, writer, { revisionId }]);
    expect(options.rateAccess).toBe(true);
    expect([options.suffix(1), options.suffix(2)]).toEqual([" (alternativa)", " (alternativa 2)"]);

    await proposeAlternative({ revisionId, locale: "en" });
    const english = mocks.deriveAlternativeFor.mock.calls[1]?.[3];
    expect([english.suffix(1), english.suffix(3)]).toEqual([" (alternative)", " (alternative 3)"]);
  });

  it("makes the project's pages load again, so going back to one lists the alternative", async () => {
    mocks.deriveAlternativeFor.mockResolvedValue({ ok: true, version: 1, scenarioId: alternative });
    await proposeAlternative({ revisionId, locale: "es" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[locale]/projects/[id]", "page");

    mocks.revalidatePath.mockReset();
    mocks.deriveAlternativeFor.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect(await proposeAlternative({ revisionId, locale: "es" })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses input that is not a valid request, without touching the database", async () => {
    for (const input of [
      undefined,
      { revisionId: "nope", locale: "es" },
      { revisionId, locale: "fr" },
      { revisionId, locale: "es", scenarioId: alternative },
      { revisionId, locale: "es", derivedBy: "someone" },
    ]) {
      expect(await proposeAlternative(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.deriveAlternativeFor).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    const error = Object.assign(new Error("duplicate key value (id)=(secret)"), { code: "23505" });
    mocks.deriveAlternativeFor.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await proposeAlternative({ revisionId, locale: "es" })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(log).toHaveBeenCalledWith("proposeAlternative failed: Error 23505");
    log.mockRestore();
  });
});

describe("previewChoice", () => {
  it("checks the revision for the member or the visitor, writing nothing", async () => {
    const preview = { ok: true, changes: [], replaces: null };
    mocks.previewChoiceFor.mockResolvedValue(preview);
    expect(await previewChoice({ revisionId })).toEqual(preview);
    const [db, member, visitor, request, options] = mocks.previewChoiceFor.mock.calls[0] ?? [];
    expect([db, member, visitor, request]).toEqual([
      { client: "app" },
      mocks.member,
      mocks.visitor,
      { revisionId },
    ]);
    expect(options).toEqual({
      rateAccess: true,
      today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    });

    await previewChoice({ revisionId, access: "none" });
    expect(mocks.previewChoiceFor.mock.calls[1]?.[4].rateAccess).toBe(false);
  });

  it("refuses input that is not a valid request, and answers failed on an error", async () => {
    for (const input of [undefined, { revisionId: "nope" }, { revisionId, access: "all" }]) {
      expect(await previewChoice(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.previewChoiceFor).not.toHaveBeenCalled();
    mocks.previewChoiceFor.mockRejectedValue(new Error("boom"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await previewChoice({ revisionId })).toEqual({ ok: false, reason: "failed" });
    expect(log).toHaveBeenCalledWith("previewChoice failed: Error");
    log.mockRestore();
  });
});

describe("chooseRevision", () => {
  const scenarioId = "6d656d6f-0000-4000-8000-000000000205";

  it("chooses for the request and loads the pages again", async () => {
    mocks.chooseRevisionFor.mockResolvedValue({ ok: true, version: 3, scenarioId });
    expect(await chooseRevision({ revisionId, baseVersion: 2 })).toEqual({
      ok: true,
      version: 3,
      scenarioId,
    });
    const [db, who, request, options] = mocks.chooseRevisionFor.mock.calls[0] ?? [];
    expect([db, who, request, options]).toEqual([
      { client: "app" },
      writer,
      { revisionId, baseVersion: 2 },
      { rateAccess: true },
    ]);
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/[locale]/scenarios/[id]", "page");
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("passes a refusal on, loading nothing again", async () => {
    mocks.chooseRevisionFor.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect(await chooseRevision({ revisionId, baseVersion: 2, access: "none" })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(mocks.chooseRevisionFor.mock.calls[0]?.[3]).toEqual({ rateAccess: false });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refuses input that is not a valid choice, without touching the database", async () => {
    for (const input of [
      undefined,
      { revisionId },
      { revisionId, baseVersion: 0 },
      { revisionId, baseVersion: 2, scenarioId },
    ]) {
      expect(await chooseRevision(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.chooseRevisionFor).not.toHaveBeenCalled();
  });
});
