/**
 * PostToolUse hook (Edit|Write): formats the file Claude just changed with Prettier.
 * Never blocks: formatting problems surface later in lint-staged and CI.
 * Runs with Node's built-in type stripping: keep to erasable TypeScript syntax.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, relative, isAbsolute } from "node:path";

/** Only files inside the project, and never dependencies. */
export function shouldFormat(file: string, projectDir: string): boolean {
  const path = relative(projectDir, file);
  return !path.startsWith("..") && !isAbsolute(path) && !path.startsWith("node_modules");
}

if (import.meta.main) {
  const input = JSON.parse(readFileSync(0, "utf8")) as { tool_input?: { file_path?: string } };
  const file = input.tool_input?.file_path;
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();

  if (file && shouldFormat(file, projectDir)) {
    try {
      execFileSync(
        join(projectDir, "node_modules/.bin/prettier"),
        ["--write", "--ignore-unknown", "--log-level", "silent", file],
        { cwd: projectDir, stdio: "ignore" },
      );
    } catch {
      // Never block on formatting.
    }
  }
}
