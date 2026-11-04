import { cookies } from "next/headers";
import { cache } from "react";

import { currentSession } from "@/auth/session";
import { memberOf, visitorOrganization } from "@/db/access";
import { db } from "@/db/client";
import { organizationsOf } from "@/db/switch-organization";
import { VISITOR_COOKIE } from "@/lib/visitors/token";

import { chooseOrganization } from "./actions";
import { DemoOrganization, OrganizationSwitcher } from "./organization-switcher";

/** What the top bar shows of this request's organization; read once, though it is drawn twice. */
const organizationOfRequest = cache(async () => {
  const session = await currentSession();
  if (session) {
    const member = await memberOf(db, session);
    if (!member) return null;
    const organizations = await organizationsOf(db, session.userId);
    return { kind: "member", organizations, activeId: member.organizationId } as const;
  }
  const cookie = (await cookies()).get(VISITOR_COOKIE)?.value;
  return { kind: "visitor", copy: (await visitorOrganization(db, cookie)) !== null } as const;
});

/**
 * The organization corner of the top bar and the ☰ menu: a member's switcher, or a visitor's demo.
 * Nothing for an account without an organization. Render it inside Suspense: it reads the request.
 */
export async function CurrentOrganization() {
  const found = await organizationOfRequest();
  if (!found) return null;
  if (found.kind === "visitor") return <DemoOrganization copy={found.copy} />;
  return (
    <OrganizationSwitcher
      organizations={found.organizations}
      activeId={found.activeId}
      switchTo={chooseOrganization}
    />
  );
}
