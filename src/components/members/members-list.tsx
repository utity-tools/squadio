"use client";

import { UserMinusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { MemberRole, MemberRow } from "@/db/members";

/** Why changing a role or removing a member did not happen; the row or the window says so. */
export type ManageFormState = { error: "signed-out" | "not-owner" | "not-found" | "failed" | null };

/** The form sends the membership's id and the role it gets. */
export type ChangeRoleAction = (
  previous: ManageFormState,
  form: FormData,
) => Promise<ManageFormState>;

/** The form sends the membership's id. */
export type RemoveMemberAction = (
  previous: ManageFormState,
  form: FormData,
) => Promise<ManageFormState>;

type Manage = { changeRole: ChangeRoleAction; remove: RemoveMemberAction };

const INITIAL: ManageFormState = { error: null };

/** The role a member or a viewer can be given instead of their own. */
const OTHER_ROLE = { member: "viewer", viewer: "member" } as const;

type MembersListProps = {
  members: MemberRow[];
  /** The owner's actions; without them the list only reads (ADR 0015). */
  manage?: Manage;
};

/**
 * The organization's members with their roles (ADR 0015). Emails show only where the page was
 * given them, which it is for the owner alone; so are the owner's controls, on every row but the
 * owner's: the other role, and removal behind a confirmation window.
 */
export function MembersList({ members, manage }: MembersListProps) {
  const t = useTranslations("Members");
  const headingId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  // What the last change did, said by the status below.
  const [announcement, setAnnouncement] = useState("");
  // Set when a member was removed: their row leaves with the button that had the focus, so the
  // list's heading takes it and the keyboard keeps its place.
  const [removals, setRemovals] = useState(0);

  useEffect(() => {
    if (removals > 0) heading.current?.focus();
  }, [removals]);

  return (
    <section aria-labelledby={headingId} className="flex w-full max-w-xl flex-col gap-3 text-left">
      <h2 id={headingId} ref={heading} tabIndex={-1} className="text-lg font-semibold">
        {t("membersHeading")}
      </h2>
      {manage && (
        <span role="status" className="sr-only">
          {announcement}
        </span>
      )}
      <ul className="flex flex-col divide-y rounded-lg border">
        {members.map((member) => (
          <li key={member.id} className="flex flex-col gap-2 px-4 py-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-medium">
                {member.name}
                {member.you && <span className="text-muted-foreground"> ({t("you")})</span>}
              </span>
              {member.email && (
                <span className="text-sm break-all text-muted-foreground">{member.email}</span>
              )}
              <span className="ml-auto text-sm">{t(`roles.${member.role}`)}</span>
            </div>
            {manage && member.role !== "owner" && (
              <MemberControls
                member={{ ...member, role: member.role }}
                manage={manage}
                onChanged={(role) =>
                  setAnnouncement(
                    t("manage.changed", { name: member.name, role: t(`roles.${role}`) }),
                  )
                }
                onRemoved={() => {
                  setAnnouncement(t("manage.removed", { name: member.name }));
                  setRemovals((count) => count + 1);
                }}
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

type MemberControlsProps = {
  member: MemberRow & { role: Exclude<MemberRole, "owner"> };
  manage: Manage;
  onChanged: (role: MemberRole) => void;
  onRemoved: () => void;
};

/** A member's or a viewer's row, for the owner: the other role, and removing them. */
function MemberControls({ member, manage, onChanged, onRemoved }: MemberControlsProps) {
  const t = useTranslations("Members");
  const target = OTHER_ROLE[member.role];
  const [state, changeAction, changing] = useActionState(
    async (previous: ManageFormState, form: FormData) => {
      const next = await manage.changeRole(previous, form);
      if (next.error === null) onChanged(target);
      return next;
    },
    INITIAL,
  );
  const label = target === "viewer" ? "makeViewer" : "makeMember";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={changeAction}>
        <input type="hidden" name="memberId" value={member.id} />
        <input type="hidden" name="role" value={target} />
        {/* Marked unavailable rather than disabled while it works, so it keeps the focus. */}
        <Button
          type="submit"
          variant="outline"
          size="sm"
          aria-label={t(`manage.${label}Label`, { name: member.name })}
          aria-disabled={changing}
          className="aria-disabled:opacity-50"
          onClick={(event) => {
            if (changing) event.preventDefault();
          }}
        >
          {changing ? t("manage.changing") : t(`manage.${label}`)}
        </Button>
      </form>
      <RemoveDialog member={member} remove={manage.remove} onRemoved={onRemoved} />
      {state.error && (
        <p role="alert" className="w-full text-[13px] text-status-bad-text">
          {t(`manageErrors.${state.error}`)}
        </p>
      )}
    </div>
  );
}

type RemoveDialogProps = {
  member: MemberRow;
  remove: RemoveMemberAction;
  onRemoved: () => void;
};

/**
 * Removing a member behind a confirmation window, as deleting is (ADR 0012): it says what goes and
 * what stays, starts on Cancel, and stays open while it works, so a failure is read in it.
 */
function RemoveDialog({ member, remove, onRemoved }: RemoveDialogProps) {
  const t = useTranslations("Members");
  const [open, setOpen] = useState(false);
  // Once removed, the window closes without taking the focus back to a button that is leaving.
  const removed = useRef(false);
  const errorId = useId();
  const [state, removeAction, removing] = useActionState(
    async (previous: ManageFormState, form: FormData) => {
      const next = await remove(previous, form);
      if (next.error === null) {
        removed.current = true;
        setOpen(false);
        onRemoved();
      }
      return next;
    },
    INITIAL,
  );

  return (
    <AlertDialog open={open} onOpenChange={(next) => !removing && setOpen(next)}>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t("manage.removeLabel", { name: member.name })}
        >
          {t("manage.remove")}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          if (removed.current) event.preventDefault();
        }}
      >
        <AlertDialogHeader icon={<UserMinusIcon />}>
          <AlertDialogTitle>{t("manage.removeTitle", { name: member.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t("manage.removeDescription")}</AlertDialogDescription>
        </AlertDialogHeader>
        <form action={removeAction} className="flex flex-col gap-5">
          <input type="hidden" name="memberId" value={member.id} />
          {state.error && (
            <p id={errorId} role="alert" className="text-[13px] text-status-bad-text">
              {t(`manageErrors.${state.error}`)}
            </p>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel type="button" disabled={removing}>
              {t("manage.cancel")}
            </AlertDialogCancel>
            {/* Marked unavailable rather than disabled, so it keeps the focus while it works. */}
            <Button
              type="submit"
              variant="destructive"
              aria-disabled={removing}
              className="aria-disabled:opacity-50"
              onClick={(event) => {
                if (removing) event.preventDefault();
              }}
            >
              {removing ? t("manage.removing") : t("manage.confirmRemove")}
            </Button>
          </AlertDialogFooter>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
