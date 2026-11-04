"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/auth/client";

/** Signs out and renders the page again without the session; `failed` says it did not happen. */
export function useSignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  async function signOut() {
    if (pending) return;
    setPending(true);
    setFailed(false);
    try {
      const { error } = await authClient.signOut();
      if (!error) {
        // The session lives in a cookie the server reads: render the page again without it.
        router.refresh();
        return;
      }
    } catch {
      // The request never reached the server: the same failure for the person.
    } finally {
      setPending(false);
    }
    setFailed(true);
  }

  return { signOut, pending, failed };
}
