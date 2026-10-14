// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const env = vi.hoisted(() => ({
  NODE_ENV: "development" as "development" | "production" | "test",
  DATABASE_URL: "postgres://squadio_app:squadio_app_dev@127.0.0.1:5434/squadio_test",
}));
vi.mock("@/env", () => ({ env }));

// Loads the module the way `next dev` does after an edit: from scratch.
const loadClient = async () => {
  vi.resetModules();
  return (await import("./client")).db.$client;
};

afterEach(async () => {
  const cached = (globalThis as { squadioPool?: { end: () => Promise<void> } }).squadioPool;
  delete (globalThis as { squadioPool?: unknown }).squadioPool;
  await cached?.end();
});

describe("db client", () => {
  it("reuses one pool across module reloads outside production", async () => {
    env.NODE_ENV = "development";

    expect(await loadClient()).toBe(await loadClient());
  });

  it("creates a pool per module load in production", async () => {
    env.NODE_ENV = "production";

    const first = await loadClient();
    const second = await loadClient();

    expect(second).not.toBe(first);
    await Promise.all([first.end(), second.end()]);
  });
});
