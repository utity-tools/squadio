import { drizzle } from "drizzle-orm/node-postgres";
import { afterAll, describe, expect, it } from "vitest";

import { readTarget } from "@/db/target";

import { appPool, ownerPool } from "./support";

// The deploy's target check reads what Postgres says, not what the connection string says.
const app = drizzle(appPool(1));
const owner = drizzle(ownerPool());

afterAll(async () => {
  await Promise.all([app.$client.end(), owner.$client.end()]);
});

describe("readTarget", () => {
  it("reports the database and role of each connection", async () => {
    await expect(readTarget(app)).resolves.toEqual({
      database: "squadio_test",
      role: "squadio_app",
    });
    await expect(readTarget(owner)).resolves.toEqual({
      database: "squadio_test",
      role: "squadio_owner",
    });
  });
});
