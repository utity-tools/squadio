import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { parseServerEnv } from "./src/lib/env/schema";

// Fail `next dev` and `next build` early, naming any missing or invalid variable.
parseServerEnv(process.env);

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

// Points next-intl at src/i18n/request.ts.
const withNextIntl = createNextIntlPlugin();

export default withNextIntl(nextConfig);
