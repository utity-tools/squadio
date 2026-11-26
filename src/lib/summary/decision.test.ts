// @vitest-environment node
import { describe, expect, it } from "vitest";

import { decisionStatus } from "./decision";
import type { Ledger } from "./summary";

// ADR 0017: the editor's bar says whether the scenario is ready to choose, as GitHub's merge
// status. No team or a missing figure comes first; then the margin's status.

const line = (cents: Ledger["lines"][number]["cents"]) =>
  ({ cents }) as unknown as Ledger["lines"][number];
const ledgerOf = (
  status: Ledger["headline"]["status"],
  lines = [line(100), line(200)],
): Pick<Ledger, "lines" | "headline"> => ({
  lines,
  headline: {
    netMarginCents: 100,
    netMarginBasisPoints: 1000,
    status,
    targetMarginBasisPoints: 2500,
  },
});

describe("decisionStatus", () => {
  it("is ready on target", () => {
    expect(decisionStatus(ledgerOf("green"), 3)).toEqual({ kind: "ready", tone: "ok" });
  });

  it("warns under target and says a loss is bad", () => {
    expect(decisionStatus(ledgerOf("amber"), 3)).toEqual({ kind: "below", tone: "warn" });
    expect(decisionStatus(ledgerOf("red"), 3)).toEqual({ kind: "loss", tone: "bad" });
  });

  it("counts the figures it still misses before any margin", () => {
    const missing = { kind: "undetermined", missing: [] } as unknown as number;
    expect(decisionStatus(ledgerOf("red", [line(100), line(missing), line(missing)]), 3)).toEqual({
      kind: "missing",
      tone: "warn",
      determined: 1,
      total: 3,
    });
  });

  it("says first when there is no team", () => {
    expect(decisionStatus(ledgerOf("green"), 0)).toEqual({ kind: "noTeam", tone: "bad" });
  });

  it("is ready without revenue, where the margin has no status", () => {
    expect(decisionStatus(ledgerOf(null), 2)).toEqual({ kind: "ready", tone: "ok" });
  });
});
