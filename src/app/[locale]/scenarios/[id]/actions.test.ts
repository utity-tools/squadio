// @vitest-environment node
// ADR 0011, "Saving": the Server Action validates its input and hands the request's cookies on.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: { get: vi.fn(), set: vi.fn() },
  saveForVisitor: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("@/db/visitor-save", () => ({ saveForVisitor: mocks.saveForVisitor }));

const { saveScenario } = await import("./actions");

const valid = {
  scenarioId: "6d656d6f-0000-4000-8000-000000000200",
  baseVersion: 1,
  changes: [{ type: "remove", id: "6d656d6f-0000-4000-8000-000000000303" }],
};

beforeEach(() => {
  mocks.saveForVisitor.mockReset();
});

describe("saveScenario", () => {
  it("saves for the visitor with the request's cookies", async () => {
    mocks.saveForVisitor.mockResolvedValue({ ok: true, version: 2, scenarioId: valid.scenarioId });
    expect(await saveScenario(valid)).toEqual({
      ok: true,
      version: 2,
      scenarioId: valid.scenarioId,
    });
    expect(mocks.saveForVisitor).toHaveBeenCalledWith({ client: "app" }, mocks.cookies, valid);
  });

  it("refuses input that is not a valid save, without touching the database", async () => {
    for (const input of [undefined, "save", { ...valid, changes: [] }, { ...valid, extra: true }]) {
      expect(await saveScenario(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.saveForVisitor).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    const error = Object.assign(new Error("duplicate key value (id)=(secret)"), { code: "23505" });
    mocks.saveForVisitor.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveScenario(valid)).toEqual({ ok: false, reason: "failed" });
    expect(log).toHaveBeenCalledWith("saveScenario failed: Error 23505");
  });
});
