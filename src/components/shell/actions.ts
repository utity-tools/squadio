"use server";

import { refresh } from "next/cache";
import { z } from "zod";

import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { switchOrganization } from "@/db/switch-organization";

// Design board 14 and ADR 0012: choosing another organization in the switcher. Who acts comes from
// the session, read on the server; the browser sends the organization's id only, and the server
// checks the account is a member of it.

/**
 * Makes one of the account's organizations the session's active one and refreshes the browser's
 * cached pages, which still show the other. The switcher then goes to the organization page: the
 * page the person was on may belong to the other organization. It reads no root params, such as
 * the locale, which Next.js forbids in Server Actions.
 */
export async function chooseOrganization(organizationId: unknown): Promise<{ ok: boolean }> {
  const id = z.uuid().safeParse(organizationId);
  const session = id.success ? await currentSession() : null;
  if (!id.success || !session) return { ok: false };
  let switched: boolean;
  try {
    switched = await switchOrganization(db, session, id.data);
  } catch (error) {
    console.error(`chooseOrganization failed: ${error instanceof Error ? error.name : "unknown"}`);
    switched = false;
  }
  if (!switched) return { ok: false };
  refresh();
  return { ok: true };
}
