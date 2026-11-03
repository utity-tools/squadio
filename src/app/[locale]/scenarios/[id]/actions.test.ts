// @vitest-environment node
// ADR 0011, "Saving", and docs/domain.md, "Choosing a scenario": the Server Actions validate their
// input and hand on who the request is: the session's member, resolved on the server (ADR 0012),
// and the request's cookies.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  cookies: { get: vi.fn(), set: vi.fn() },
  member: { organizationId: "0b5e0c1e-0000-4000-8000-000000000001" } as unknown,
  saveScenarioFor: vi.fn(),
  setChoiceFor: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => mocks.cookies }));
vi.mock("@/db/client", () => ({ db: { client: "app" } }));
vi.mock("next/cache", () => ({ refresh: mocks.refresh }));
vi.mock("@/db/request-access", () => ({ currentMember: async () => mocks.member }));
vi.mock("@/db/scenario-writes", () => ({
  saveScenarioFor: mocks.saveScenarioFor,
  setChoiceFor: mocks.setChoiceFor,
}));

const writer = { member: mocks.member, jar: mocks.cookies };

const { saveScenario, setScenarioChoice } = await import("./actions");

const valid = {
  scenarioId: "6d656d6f-0000-4000-8000-000000000200",
  baseVersion: 1,
  changes: [{ type: "remove", id: "6d656d6f-0000-4000-8000-000000000303" }],
};

beforeEach(() => {
  for (const mock of [mocks.saveScenarioFor, mocks.setChoiceFor, mocks.refresh]) {
    mock.mockReset();
  }
});

describe("saveScenario", () => {
  it("saves for the request's member and cookies", async () => {
    mocks.saveScenarioFor.mockResolvedValue({ ok: true, version: 2, scenarioId: valid.scenarioId });
    expect(await saveScenario(valid)).toEqual({
      ok: true,
      version: 2,
      scenarioId: valid.scenarioId,
    });
    expect(mocks.saveScenarioFor).toHaveBeenCalledWith({ client: "app" }, writer, valid);
  });

  it("refuses input that is not a valid save, without touching the database", async () => {
    for (const input of [undefined, "save", { ...valid, changes: [] }, { ...valid, extra: true }]) {
      expect(await saveScenario(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.saveScenarioFor).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    const error = Object.assign(new Error("duplicate key value (id)=(secret)"), { code: "23505" });
    mocks.saveScenarioFor.mockRejectedValue(error);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await saveScenario(valid)).toEqual({ ok: false, reason: "failed" });
    expect(log).toHaveBeenCalledWith("saveScenario failed: Error 23505");
  });
});

describe("setScenarioChoice", () => {
  const choice = { scenarioId: valid.scenarioId, baseVersion: 1 };

  it("chooses or unchooses for the request, with rate access, and refreshes the page", async () => {
    mocks.setChoiceFor
      .mockResolvedValueOnce({ ok: true, version: 2, scenarioId: valid.scenarioId })
      .mockResolvedValueOnce({ ok: true, version: 3, scenarioId: valid.scenarioId });
    expect(await setScenarioChoice({ ...choice, chosen: true })).toEqual({
      ok: true,
      version: 2,
      scenarioId: valid.scenarioId,
    });
    expect(mocks.setChoiceFor).toHaveBeenCalledWith({ client: "app" }, writer, choice, {
      chosen: true,
      rateAccess: true,
    });
    expect(await setScenarioChoice({ ...choice, chosen: false })).toMatchObject({ version: 3 });
    expect(mocks.setChoiceFor).toHaveBeenLastCalledWith({ client: "app" }, writer, choice, {
      chosen: false,
      rateAccess: true,
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it("acts without rate access for a page on ?access=none, and refreshes nothing it refused", async () => {
    mocks.setChoiceFor.mockResolvedValue({ ok: false, reason: "no-rate-access" });
    expect(await setScenarioChoice({ ...choice, chosen: true, access: "none" })).toEqual({
      ok: false,
      reason: "no-rate-access",
    });
    expect(mocks.setChoiceFor).toHaveBeenCalledWith({ client: "app" }, writer, choice, {
      chosen: true,
      rateAccess: false,
    });
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("refuses input that is not a valid choice, without touching the database", async () => {
    for (const input of [
      undefined,
      choice,
      { ...choice, chosen: "yes" },
      { ...choice, chosen: true, access: "all" },
      { ...choice, chosen: true, organizationId: valid.scenarioId },
    ]) {
      expect(await setScenarioChoice(input)).toEqual({ ok: false, reason: "invalid" });
    }
    expect(mocks.setChoiceFor).not.toHaveBeenCalled();
  });

  it("answers failed for an unexpected error, logging no values", async () => {
    mocks.setChoiceFor.mockRejectedValue(Object.assign(new Error("secret"), { code: "40P01" }));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await setScenarioChoice({ ...choice, chosen: true })).toEqual({
      ok: false,
      reason: "failed",
    });
    expect(log).toHaveBeenCalledWith("setScenarioChoice failed: Error 40P01");
  });
});
