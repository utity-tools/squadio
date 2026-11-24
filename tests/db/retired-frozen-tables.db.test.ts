import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { ownerPool } from "./support";

// ADR 0013, slice 6c: choosing points at a revision, so the frozen tables are gone and the check
// that a scenario is chosen exactly when it points at one has been validated against every row.

const owner = drizzle(ownerPool());

afterAll(async () => {
  await owner.$client.end();
});

describe("migration 0017", () => {
  it("validates the check that a scenario is chosen exactly when it points at a revision", async () => {
    const { rows } = await owner.execute<{ validated: boolean }>(sql`
      select convalidated as validated
        from pg_constraint
       where conname = 'scenarios_chosen_revision_check'`);
    expect(rows).toEqual([{ validated: true }]);
  });

  it("drops the frozen tables", async () => {
    const { rows } = await owner.execute<{ rates: string | null; settings: string | null }>(sql`
      select to_regclass('public.frozen_rates')::text as rates,
             to_regclass('public.frozen_cost_config')::text as settings`);
    expect(rows).toEqual([{ rates: null, settings: null }]);
  });
});
