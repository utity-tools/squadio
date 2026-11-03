import { createAuthClient } from "better-auth/react";

// The browser's side of Better Auth: it calls /api/auth on the page's own origin.
export const authClient = createAuthClient();
