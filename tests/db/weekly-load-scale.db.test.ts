import { performance } from "node:perf_hooks";

import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadScenario } from "@/db/load-scenario";
import {
  assignments,
  categories,
  config,
  costConfig,
  people,
  projects,
  scenarios,
} from "@/db/schema";
import { type AccessContext, withOrganization } from "@/db/tenant";
import { teamOverAllocation } from "@/lib/load/over-allocation";
import { scenarioWeeks, weeklyLoad } from "@/lib/load/weekly-load";

import { SOME_DAY, appPool, newOrganization } from "./support";
import { markChosen } from "./choose";

// docs/plan.md, v0.4 slice 3: the weekly load measured with realistic data. A synthetic
// consultancy of 150 people in 6 categories, with 30 other projects whose chosen scenarios hold 50
// assignments each over 2026 to 2028, and a draft of 20 assignments over a year on the page. It
// checks what is loaded and prints how long loading and recalculating take; it asserts no time,
// which would only make CI flaky. The figures go in the pull request.

const PEOPLE = 150;
const PROJECTS = 30;
const PER_SCENARIO = 50;
const ON_PAGE = 20;

const app = drizzle(appPool(1));
let context: AccessContext;
let pageScenario: string;

/** A deterministic sequence, so every run measures the same data. */
function sequence(seed: number) {
  let state = seed;
  return (max: number) => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state % max;
  };
}

const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

const median = (values: number[]) =>
  values.toSorted((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

async function timed(runs: number, run: () => unknown) {
  const times: number[] = [];
  for (let index = 0; index < runs; index++) {
    const start = performance.now();
    await run();
    times.push(performance.now() - start);
  }
  return median(times);
}

beforeAll(async () => {
  const organizationId = await newOrganization(app);
  context = { organizationId, rateAccess: false };
  const next = sequence(42);
  pageScenario = await withOrganization(app, { ...context, rateAccess: true }, async (tx) => {
    await tx
      .insert(config)
      .values({ organizationId, netAnnualHours: 1550, defaultWeeklyHours: 40 });
    await tx
      .insert(costConfig)
      .values({ organizationId, overhead: 1500, buffer: 1000, targetMargin: 2500 });
    const categoryRows = await tx
      .insert(categories)
      .values(
        Array.from({ length: 6 }, (_, index) => ({
          organizationId,
          name: `Category ${index + 1}`,
        })),
      )
      .returning();
    const personRows = await tx
      .insert(people)
      .values(
        Array.from({ length: PEOPLE }, (_, index) => ({
          organizationId,
          name: `Person ${index + 1}`,
          categoryId: categoryRows[index % categoryRows.length]!.id,
          weeklyHours: 40,
        })),
      )
      .returning();
    // A person is on a scenario once: each scenario walks the people from its own offset.
    const assignment = (
      scenarioId: string,
      offset: number,
      slot: number,
      from: string,
      days: number,
    ) => {
      const person = personRows[(offset + slot * 7) % PEOPLE]!;
      const startDate = addDays(from, next(days));
      return {
        organizationId,
        scenarioId,
        categoryId: person.categoryId,
        personId: person.id,
        projectRole: "Developer",
        weeklyHours: 40,
        allocation: [20, 50, 80, 100][next(4)]!,
        startDate,
        endDate: addDays(startDate, 30 + next(150)),
      };
    };
    for (let index = 0; index < PROJECTS; index++) {
      const [project] = await tx
        .insert(projects)
        .values({
          organizationId,
          name: `Project ${index + 1}`,
          client: "Client",
          pricingModel: "time_and_materials",
        })
        .returning();
      const [chosen] = await tx
        .insert(scenarios)
        .values({ organizationId, projectId: project!.id, name: "Chosen" })
        .returning();
      await tx
        .insert(assignments)
        .values(
          Array.from({ length: PER_SCENARIO }, (_, slot) =>
            assignment(chosen!.id, index, slot, "2026-01-01", 900),
          ),
        );
      await markChosen(tx, chosen!.id);
    }
    const [page] = await tx
      .insert(projects)
      .values({
        organizationId,
        name: "On the page",
        client: "Client",
        pricingModel: "time_and_materials",
      })
      .returning();
    const [draft] = await tx
      .insert(scenarios)
      .values({ organizationId, projectId: page!.id, name: "Draft" })
      .returning();
    await tx
      .insert(assignments)
      .values(
        Array.from({ length: ON_PAGE }, (_, slot) =>
          assignment(draft!.id, 0, slot, "2027-01-01", 200),
        ),
      );
    return draft!.id;
  });
});

afterAll(async () => {
  await app.$client.end();
});

describe("the weekly load with realistic data", () => {
  it("loads every commitment and recalculates the load of each edit", async () => {
    const loaded = await loadScenario(app, context, pageScenario, SOME_DAY);
    if (!loaded) throw new Error("expected the scenario");
    const { basis, team } = loaded.editing;
    expect(basis.commitments).toHaveLength(PROJECTS * PER_SCENARIO);

    const loading = await timed(5, () => loadScenario(app, context, pageScenario, SOME_DAY));
    const input = {
      projectId: basis.project.id,
      plannedPeriod: basis.project.plannedPeriod,
      team,
      commitments: basis.commitments,
    };
    const weeks = scenarioWeeks(team, null);
    // What the page runs on each edit: the bench's load and the team's flags.
    const recalculating = await timed(20, () => {
      weeklyLoad({ ...input, weeks });
      teamOverAllocation(input);
    });
    expect(weeks.length).toBeGreaterThan(30);

    console.info(
      `[weekly load] ${basis.commitments.length} commitments, ${team.length} assignments, ` +
        `${weeks.length} weeks: loading the scenario ${loading.toFixed(1)} ms, ` +
        `recalculating on an edit ${recalculating.toFixed(2)} ms (medians)`,
    );
  });
});
