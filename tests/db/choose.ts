import type { NodePgDatabase } from "drizzle-orm/node-postgres";

import { type ChoiceInput, chooseScenarioIn, pointAtLatestRevision } from "@/db/choose-scenario";
import { type AccessContext, type TenantTransaction, withOrganization } from "@/db/tenant";

import { SOME_DAY } from "./support";

/**
 * Chooses a scenario as choosing does, by nobody signed in, on SOME_DAY: for tests that need a
 * chosen scenario and test something else. tests/db/choose-scenario.db.test.ts tests choosing.
 */
export const chooseAsNobody = (db: NodePgDatabase, context: AccessContext, input: ChoiceInput) =>
  withOrganization(db, context, (tx) =>
    chooseScenarioIn(tx, input, { authorId: null, commitSha: null, today: SOME_DAY }),
  );

/**
 * Marks a scenario chosen inside a transaction with rate access, pointing at a revision of it as
 * saved, as choosing does but without its checks: for tests that build their own rows.
 */
export const markChosen = (tx: TenantTransaction, scenarioId: string) =>
  pointAtLatestRevision(tx, scenarioId, { authorId: null, commitSha: null, today: SOME_DAY });
