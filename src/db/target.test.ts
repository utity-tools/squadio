// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PRODUCTION_TARGETS, targetMismatches } from "./target";

// docs/incidents/2026-10-23-migrations-in-neondb.md: a connection string can point at the wrong
// database or role and every query still succeeds, so the deploy checks where it landed.
describe("targetMismatches", () => {
  it("finds nothing when the connection landed where it should", () => {
    expect(targetMismatches(PRODUCTION_TARGETS.owner, PRODUCTION_TARGETS.owner)).toEqual([]);
  });

  it("names the wrong database, as when a string was copied with Neon's default", () => {
    expect(
      targetMismatches({ database: "neondb", role: "squadio_owner" }, PRODUCTION_TARGETS.owner),
    ).toEqual(['connected to database "neondb", expected "squadio"']);
  });

  it("names the wrong role, as when the app's string sits where the owner's should", () => {
    expect(targetMismatches(PRODUCTION_TARGETS.app, PRODUCTION_TARGETS.owner)).toEqual([
      'connected as role "squadio_app", expected "squadio_owner"',
    ]);
  });

  it("names both when both are wrong", () => {
    expect(
      targetMismatches({ database: "neondb", role: "neondb_owner" }, PRODUCTION_TARGETS.app),
    ).toEqual([
      'connected to database "neondb", expected "squadio"',
      'connected as role "neondb_owner", expected "squadio_app"',
    ]);
  });
});

// Spelled out on purpose: an edit to production's targets should be deliberate, and fail here first.
describe("PRODUCTION_TARGETS", () => {
  it("puts both roles on the squadio database", () => {
    expect(PRODUCTION_TARGETS).toEqual({
      owner: { database: "squadio", role: "squadio_owner" },
      app: { database: "squadio", role: "squadio_app" },
    });
  });
});
