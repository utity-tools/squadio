import "server-only";

import { parseServerEnv } from "@/lib/env/schema";

/** Validated server environment. The only place server code reads `process.env`. */
export const env = parseServerEnv(process.env);
