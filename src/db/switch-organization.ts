import { and, asc, eq, exists } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { member, organization, session } from "./auth-schema";

// Design board 14, "Menús de organización y cuenta", and ADR 0012: the switcher lists the
// account's own organizations, and choosing one makes it the session's active organization. The
// account and the session come from the request, read on the server; the browser sends only the
// organization's id, which is checked against the account's memberships in the same statement.

/** One of the account's organizations, as the switcher lists it. */
export type OwnOrganization = {
  id: string;
  name: string;
  /** Adopted from a visitor's copy: its data is the demo's synthetic example. */
  example: boolean;
};

const isUuid = (value: unknown): value is string => z.uuid().safeParse(value).success;

/** The account's organizations, in the order it joined them. */
export async function organizationsOf(
  db: NodePgDatabase,
  userId: string,
): Promise<OwnOrganization[]> {
  if (!isUuid(userId)) return [];
  return db
    .select({ id: organization.id, name: organization.name, example: organization.example })
    .from(member)
    .innerJoin(organization, eq(organization.id, member.organizationId))
    .where(eq(member.userId, userId))
    .orderBy(asc(member.createdAt), asc(member.id));
}

/**
 * Makes `organizationId` the active organization of the account's session, if the account is a
 * member of it. False, and nothing changed, otherwise: another organization, a malformed id, or a
 * session that is not the account's.
 */
export async function switchOrganization(
  db: NodePgDatabase,
  signedIn: { userId: string; sessionId: string },
  organizationId: string,
): Promise<boolean> {
  const { userId, sessionId } = signedIn;
  if (![userId, sessionId, organizationId].every(isUuid)) return false;
  const updated = await db
    .update(session)
    .set({ activeOrganizationId: organizationId, updatedAt: new Date() })
    .where(
      and(
        eq(session.id, sessionId),
        eq(session.userId, userId),
        exists(
          db
            .select({ id: member.id })
            .from(member)
            .where(and(eq(member.userId, userId), eq(member.organizationId, organizationId))),
        ),
      ),
    )
    .returning({ id: session.id });
  return updated.length === 1;
}
