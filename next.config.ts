import type { NextConfig } from "next";

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

export default nextConfig;
