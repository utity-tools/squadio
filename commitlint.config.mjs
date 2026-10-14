/** Conventional Commits, restricted to the types listed in AGENTS.md. */
const config = {
  extends: ["@commitlint/config-conventional"],
  // Dependabot bodies carry release notes with long lines; its headers use our prefixes.
  ignores: [(message) => /^Signed-off-by: dependabot\[bot\]/m.test(message)],
  rules: {
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "test", "refactor", "ci", "build", "perf"],
    ],
    "header-max-length": [2, "always", 100],
  },
};

export default config;
