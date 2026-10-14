// @vitest-environment node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { evaluate } from "./guard-bash";

const hook = fileURLToPath(new URL("./guard-bash.ts", import.meta.url));

describe("evaluate", () => {
  it.each([
    "pnpm test",
    "git status -sb",
    "git add src/lib/cost.ts",
    "git add .claude/settings.json && git commit -m 'build: add settings'",
    "git commit --amend --no-edit",
    "git push -u origin HEAD",
    "git push --force-with-lease",
    "cat .env.example",
    "echo '.env*' >> .gitignore",
  ])("allows %s on a feature branch", (command) => {
    expect(evaluate(command, "feat/team-builder")).toBeNull();
  });

  it.each([
    ["git add -A", "stage files one by one"],
    ["git add --all", "stage files one by one"],
    ["git add .", "stage files one by one"],
    ["git -C ../squadio add . && git status", "stage files one by one"],
    ["git commit -am 'fix: typo'", "stage files one by one"],
    ["git commit --no-verify -m 'fix: typo'", "--no-verify"],
    ["git commit -nm 'fix: typo'", "--no-verify"],
    ["git push --no-verify", "--no-verify"],
    ["git push --force", "force push"],
    ["git push -f origin feat/x", "force push"],
    ["git push origin +feat/x", "force push"],
    ["git push origin main", "main"],
    ["git push origin HEAD:main", "main"],
    ["cat .env", ".env"],
    ["grep DATABASE_URL .env.local", ".env"],
    ["gh pr merge 12 --rebase", "owner merges"],
  ])("blocks %s", (command, reason) => {
    expect(evaluate(command, "feat/team-builder")).toContain(reason);
  });

  it("blocks committing and pushing while on main", () => {
    expect(evaluate("git commit -m 'feat: x'", "main")).toContain("main");
    expect(evaluate("git push", "main")).toContain("main");
  });

  it("allows read-only git on main", () => {
    expect(evaluate("git pull --ff-only", "main")).toBeNull();
  });
});

describe("guard-bash hook", () => {
  const run = (command: string) =>
    spawnSync(process.execPath, [hook], {
      input: JSON.stringify({ cwd: process.cwd(), tool_input: { command } }),
      encoding: "utf8",
    });

  it("exits 0 for an allowed command", () => {
    expect(run("pnpm lint").status).toBe(0);
  });

  it("exits 2 with the reason on stderr for a blocked command", () => {
    const result = run("git add -A");

    expect(result.status).toBe(2);
    expect(result.stderr).toContain("Blocked:");
  });
});
