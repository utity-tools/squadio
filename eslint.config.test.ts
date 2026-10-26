// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const eslint = new ESLint({ cwd: import.meta.dirname });

/** Rule ids ESLint reports for `code` linted as if it lived at `filePath`. */
async function ruleIds(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.map((message) => message.ruleId) ?? [];
}

const reads = {
  member: "export const value = process.env.FOO;\n",
  destructured: "const { env } = process;\nexport const value = env.FOO;\n",
  globalThis: "export const value = globalThis.process.env.FOO;\n",
  "node:process import": 'import { env } from "node:process";\nexport const value = env.FOO;\n',
  "process import": 'import { env } from "process";\nexport const value = env.FOO;\n',
};

describe("process.env restriction", () => {
  it.each(Object.entries(reads))("reports a %s read in app code", async (_, code) => {
    expect(await ruleIds(code, "src/app/example.ts")).toHaveLength(1);
  });

  it("reports reads in other src/env-prefixed files", async () => {
    expect(await ruleIds(reads.member, "src/env.test.ts")).toHaveLength(1);
  });

  it.each([
    "src/env.ts",
    "src/env.client.ts",
    "next.config.ts",
    "drizzle.config.ts",
    "playwright.config.ts",
    "tests/db/example.ts",
    ".claude/hooks/example.ts",
  ])("allows reads in %s", async (filePath) => {
    for (const code of Object.values(reads)) {
      expect(await ruleIds(code, filePath)).toEqual([]);
    }
  });
});

describe("ignored files", () => {
  it.each([".claude/worktrees/some-branch/src/app/example.ts", ".next/server/example.js"])(
    "ignores %s",
    async (filePath) => {
      expect(await eslint.isPathIgnored(filePath)).toBe(true);
    },
  );

  it("lints the rest of .claude", async () => {
    expect(await eslint.isPathIgnored(".claude/hooks/example.ts")).toBe(false);
  });
});
