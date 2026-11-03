import { toNextJsHandler } from "better-auth/next-js";

import { getAuth } from "@/auth/server";

// Better Auth's endpoints: sign-in, the providers' callbacks, the OAuth proxy and sessions.
// src/proxy.ts leaves /api/ alone, so no locale is added to these paths.
export const { GET, POST } = toNextJsHandler((request) => getAuth().handler(request));
