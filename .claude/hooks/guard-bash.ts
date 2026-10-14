/**
 * PreToolUse hook (Bash): enforces the AGENTS.md workflow before Claude runs a command.
 * Exit code 2 blocks the command and sends stderr back to Claude.
 * Runs with Node's built-in type stripping: keep to erasable TypeScript syntax.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** Matches `git <subcommand>`, also with `-C <path>`, up to the end of that command. */
const git = (subcommand: string, rest: string) =>
  new RegExp(String.raw`(?:^|[;&|(\s])git(?:\s+-C\s+\S+)?\s+${subcommand}\b[^;&|]*${rest}`);

const END = String.raw`(?=$|[\s;&|)])`;

const rules: { matches: (command: string, branch: string) => boolean; reason: string }[] = [
  {
    matches: (command) =>
      git("add", String.raw`\s(?:-A|--all|\.)${END}`).test(command) ||
      git("commit", String.raw`\s-(?!-)[A-Za-z]*a`).test(command),
    reason: "stage files one by one (git add <file>), never everything at once.",
  },
  {
    matches: (command) =>
      git("(?:commit|push)", String.raw`\s--no-verify`).test(command) ||
      git("commit", String.raw`\s-(?!-)[A-Za-z]*n`).test(command),
    reason: "skipping git hooks (--no-verify) is not allowed. Fix the failing check instead.",
  },
  {
    matches: (command) =>
      git("push", String.raw`\s(?:--force(?![-\w])|-(?!-)[A-Za-z]*f|\+\S)`).test(command),
    reason: "force push is not allowed. Use --force-with-lease on your own branch if needed.",
  },
  {
    matches: (command, branch) =>
      (branch === "main" && git("(?:commit|push)", "").test(command)) ||
      git("push", String.raw`\s(?:\S+:)?main${END}`).test(command),
    reason: "never commit or push to main. Create a <type>/<kebab-case> branch and open a PR.",
  },
  {
    matches: (command) =>
      /(?:^|[\s'"=/])\.env(?:\.(?!example\b)[\w.-]+)?(?=$|[\s'";&|)])/.test(command),
    reason: "never read or print .env files. Only .env.example is safe to open.",
  },
  {
    matches: (command) => /(?:^|[;&|(\s])gh\s+pr\s+merge\b/.test(command),
    reason: "only the human owner merges pull requests.",
  },
];

/** Returns why the command is blocked, or null when it may run. */
export function evaluate(command: string, branch: string): string | null {
  return rules.find((rule) => rule.matches(command, branch))?.reason ?? null;
}

function currentBranch(cwd: string): string {
  try {
    return execFileSync("git", ["-C", cwd, "branch", "--show-current"], {
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8")) as {
    cwd?: string;
    tool_input?: { command?: string };
  };
  const reason = evaluate(input.tool_input?.command ?? "", currentBranch(input.cwd ?? "."));

  if (reason) {
    process.stderr.write(`Blocked: ${reason}\n`);
    process.exit(2);
  }
}
