import { and, asc, eq, gt, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { z } from "zod";

import { type InvitableRole, invitableRoleSchema } from "@/lib/invitations/rules";
import { MEMBER_ROLE, OWNER_ROLE, VIEWER_ROLE } from "@/lib/membership/capabilities";

import type { Member } from "./access";
import { invitation, member, user } from "./auth-schema";

// ADR 0015, amendment of 2026-11-23 (slice 4b): what the members page shows. Every member sees the
// members' names and roles; only the owner sees their emails and the pending invitations, which
// are not even read for anyone else.

const roleSchema = z.enum([OWNER_ROLE, MEMBER_ROLE, VIEWER_ROLE]);

export type MemberRole = z.infer<typeof roleSchema>;

export type MemberRow = {
  id: string;
  name: string;
  role: MemberRole;
  /** The member's email, for the owner only; null for everyone else. */
  email: string | null;
  /** The account reading the page. */
  you: boolean;
};

export type PendingInvitation = {
  id: string;
  email: string;
  role: InvitableRole;
  expiresAt: Date;
};

export type MembersPage = {
  members: MemberRow[];
  /** The organization's pending invitations, for the owner only; null for everyone else. */
  invitations: PendingInvitation[] | null;
};

/**
 * The members of the account's organization, the owner first and then in the order they joined,
 * and, for the owner, the invitations still pending at `now`, oldest first. A role Squadio does not
 * know is left out, as it gives no membership (capabilitiesFor).
 */
export async function loadMembers(
  db: NodePgDatabase,
  reader: Member,
  now: Date = new Date(),
): Promise<MembersPage> {
  const owner = reader.capabilities.manage;
  const rows = await db
    .select({
      id: member.id,
      userId: member.userId,
      name: user.name,
      role: member.role,
      email: user.email,
    })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, reader.organizationId))
    .orderBy(sql`${member.role} = ${OWNER_ROLE} desc`, asc(member.createdAt), asc(member.id));

  const members = rows.flatMap((row): MemberRow[] => {
    const role = roleSchema.safeParse(row.role);
    if (!role.success) return [];
    return [
      {
        id: row.id,
        name: row.name,
        role: role.data,
        email: owner ? row.email : null,
        you: row.userId === reader.userId,
      },
    ];
  });
  if (!owner) return { members, invitations: null };

  const pending = await db
    .select({
      id: invitation.id,
      email: invitation.email,
      role: invitation.role,
      expiresAt: invitation.expiresAt,
    })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, reader.organizationId),
        eq(invitation.status, "pending"),
        gt(invitation.expiresAt, now),
      ),
    )
    .orderBy(asc(invitation.createdAt), asc(invitation.id));
  return {
    members,
    invitations: pending.map((row) => ({ ...row, role: invitableRoleSchema.parse(row.role) })),
  };
}
