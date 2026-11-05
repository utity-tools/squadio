// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { corrections } from "./corrections";
import type { PortfolioProject } from "./portfolio";
import { missing, overCap, portfolio, project, scenario } from "./portfolio.fixtures";

// docs/domain.md, "Pending corrections": once per missing input, not once per scenario.

const ref = (id: string, projectId: string) => ({
  id,
  name: id.toUpperCase(),
  project: { id: projectId, name: projectId },
});

describe("corrections", () => {
  it("lists a missing cost once, however many scenarios miss it", () => {
    const found = corrections(
      portfolio([
        project("portal", [
          scenario("a", { money: missing(["devops"]) }),
          scenario("b", { money: missing(["devops"]) }),
        ]),
        project("tooling", [scenario("c", { money: missing(["devops"]) })]),
      ]),
    );

    expect(found).toEqual([
      {
        kind: "missingCost",
        category: { id: "devops", name: "DevOps Engineer" },
        first: ref("a", "portal"),
        more: 2,
      },
    ]);
  });

  it("adds a missing sell rate only when a time-and-materials project uses the category", () => {
    const found = corrections(
      portfolio([
        project("portal", [scenario("a", { money: missing(["devops"]) })]),
        project("retainer", [scenario("b", { money: missing(["data", "devops"]) })], {
          pricingModel: "time_and_materials",
        }),
      ]),
    );

    expect(
      found.map(({ kind, ...rest }) => [kind, "category" in rest && rest.category.id]),
    ).toEqual([
      ["missingCost", "data"],
      ["missingCost", "devops"],
      ["missingSellRate", "data"],
      ["missingSellRate", "devops"],
    ]);
    // The sell rate leads to the T&M scenario, the cost to the first scenario that misses it.
    expect(found[3]).toMatchObject({ first: ref("b", "retainer"), more: 0 });
    expect(found[1]).toMatchObject({ first: ref("a", "portal"), more: 1 });
  });

  it("lists a project's missing price once, and its exceeded cap once", () => {
    const found = corrections(
      portfolio([
        project(
          "retainer",
          [scenario("a", { money: overCap }), scenario("b", { money: overCap })],
          {
            pricingModel: "time_and_materials",
          },
        ),
        project("tooling", [
          scenario("c", { money: missing([], { price: true }) }),
          scenario("d", { money: missing([], { price: true }) }),
        ]),
      ]),
    );

    expect(found).toEqual([
      {
        kind: "missingPrice",
        project: { id: "tooling", name: "tooling" },
        first: ref("c", "tooling"),
        more: 1,
      },
      {
        kind: "budgetCapExceeded",
        project: { id: "retainer", name: "retainer" },
        first: ref("a", "retainer"),
        more: 1,
      },
    ]);
  });

  it("leads first to a chosen scenario", () => {
    const found = corrections(
      portfolio([
        project("alpha", [scenario("a", { money: missing(["data"]) })]),
        project("beta", [scenario("b", { chosen: true, money: missing(["data"]) })]),
      ]),
    );

    expect(found[0]).toMatchObject({ first: ref("b", "beta"), more: 1 });
  });

  it("orders costs, then sell rates, then prices, then caps, each by name", () => {
    const found = corrections(
      portfolio([
        project("retainer", [scenario("a", { money: overCap })], {
          pricingModel: "time_and_materials",
        }),
        project("tooling", [scenario("b", { money: missing(["senior"], { price: true }) })]),
        project("upkeep", [scenario("c", { money: missing(["data"]) })], {
          pricingModel: "time_and_materials",
        }),
      ]),
    );

    expect(found.map((correction) => correction.kind)).toEqual([
      "missingCost",
      "missingCost",
      "missingSellRate",
      "missingPrice",
      "budgetCapExceeded",
    ]);
    expect(found.slice(0, 2).map((c) => ("category" in c ? c.category.name : ""))).toEqual([
      "Data Engineer",
      "Senior Developer",
    ]);
  });

  it("has none for a complete organization", () => {
    expect(corrections(portfolio([project("portal", [scenario("a")])]))).toEqual([]);
  });

  it("has none without rate access", () => {
    expect(
      corrections(portfolio([project("portal", [scenario("a", { money: null })])], false)),
    ).toEqual([]);
  });

  it("names each missing input once, and counts every scenario it affects", () => {
    const categoryIds = fc.subarray(["data", "devops", "senior"]);
    const projects = fc.array(
      fc.record({
        model: fc.constantFrom("fixed" as const, "time_and_materials" as const),
        scenarios: fc.array(categoryIds, { maxLength: 4 }),
      }),
      { maxLength: 5 },
    );

    fc.assert(
      fc.property(projects, (rows) => {
        const built: PortfolioProject[] = rows.map((row, p) =>
          project(
            `p${p}`,
            row.scenarios.map((ids, s) => scenario(`p${p}s${s}`, { money: missing(ids) })),
            { pricingModel: row.model },
          ),
        );
        const found = corrections(portfolio(built));

        for (const kind of ["missingCost", "missingSellRate"] as const) {
          const named = found.flatMap((c) => (c.kind === kind ? [c.category.id] : []));
          expect(new Set(named).size).toBe(named.length);
          for (const correction of found.filter((c) => c.kind === kind)) {
            if (!("category" in correction)) continue;
            const affected = built.flatMap((p) =>
              kind === "missingSellRate" && p.pricingModel === "fixed"
                ? []
                : p.scenarios.filter((s) =>
                    s.money?.warnings.some(
                      (w) =>
                        w.code === "missingRate" && w.categoryIds.includes(correction.category.id),
                    ),
                  ),
            );
            expect(correction.more + 1).toBe(affected.length);
          }
        }
      }),
    );
  });
});
