// `pnpm db:backfill-revisions`: gives every scenario chosen before v0.5's slice 6 a revision and
// points at it (docs/domain.md, "Choosing a revision"; migration 0016). Connects as the owner role,
// like migrations, and sets each organization's context in turn. Run by deploy.yml and ci.yml right
// after the migrations; running it again
// changes nothing. `--dry-run` counts what it would do and writes nothing. It prints counts only.
import nextEnv from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { z } from "zod";

import { backfillChosenRevisions } from "@/db/backfill-chosen-revisions";
import { madridToday } from "@/lib/bench/occupancy";

// @next/env is CommonJS: its named exports only exist on the default one in ESM.
nextEnv.loadEnvConfig(process.cwd(), true, { info: () => {}, error: console.error });

// Only the database and the build's commit, which the revision records for traceability.
const { DATABASE_OWNER_URL, GITHUB_SHA } = z
  .object({
    DATABASE_OWNER_URL: z.url(),
    GITHUB_SHA: z
      .string()
      .regex(/^[0-9a-f]{40}$/)
      .optional(),
  })
  .parse(process.env);
const dryRun = process.argv.includes("--dry-run");
const pool = new Pool({ connectionString: DATABASE_OWNER_URL, max: 1 });
try {
  const { pending, written, reused, failed } = await backfillChosenRevisions(drizzle(pool), {
    today: madridToday(new Date()),
    commitSha: GITHUB_SHA ?? null,
    dryRun,
  });
  console.log(
    dryRun
      ? `${pending} chosen scenarios have no revision; nothing written (dry run).`
      : `${pending} chosen scenarios had no revision: ${written} got a new one, ${reused} their latest.`,
  );
  // Scenario ids are random UUIDs, not personal data. They are unchosen: none can be costed, so
  // none has a revision to point at; choosing one again once fixed makes it one.
  if (failed.length > 0) {
    console.warn(
      `::warning::Unchose ${failed.length} that could not be costed: ${failed.join(", ")}.`,
    );
  }
} finally {
  await pool.end();
}
