import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const envMessage =
  "Read validated env vars from `@/env` (server) or `@/env.client` (client) instead.";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Env vars are validated once, in src/env.ts and src/env.client.ts. Blocks `process.env`,
    // `process["env"]`, `const { env } = process`, `globalThis.process` and `env` imported
    // from "process" or "node:process".
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: envMessage },
        { object: "globalThis", property: "process", message: envMessage },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: ["process", "node:process"].map((name) => ({
            name,
            importNames: ["env"],
            message: envMessage,
          })),
        },
      ],
    },
  },
  {
    // The validated env modules and tooling that runs outside the app.
    files: [
      "src/env.ts",
      "src/env.client.ts",
      "next.config.ts",
      "drizzle.config.ts",
      "playwright.config.ts",
      "tests/**",
      ".claude/hooks/**",
    ],
    rules: { "no-restricted-properties": "off", "no-restricted-imports": "off" },
  },
  // Must stay last: turns off stylistic rules that Prettier owns.
  prettier,
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
  ]),
]);

export default eslintConfig;
