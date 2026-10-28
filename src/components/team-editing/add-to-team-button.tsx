"use client";

import { UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";

import { Button } from "@/components/ui/button";

import type { TeamEditing } from "./team-editing";

export type AddToTeamButtonProps = {
  editing: TeamEditing;
  /**
   * Whether a step that sends focus to the top of the team lands here: in the empty team, where
   * there is no node to focus.
   */
  takesTopFocus?: boolean;
  className?: string;
};

/**
 * "Add to team…" for an assignment that reports to no one: the way to start a team, and a list of
 * the people that works when the bench is hidden.
 */
export function AddToTeamButton({
  editing,
  takesTopFocus = false,
  className,
}: AddToTeamButtonProps) {
  const t = useTranslations("TeamEditing");
  const button = useRef<HTMLButtonElement>(null);
  const request = editing.focusRequest;

  useEffect(() => {
    if (!takesTopFocus || !request || !("top" in request.target)) return;
    if (request.move) button.current?.focus();
    editing.focusDone(request.nonce);
  }, [takesTopFocus, request, editing]);

  return (
    <Button
      ref={button}
      variant="outline"
      size="sm"
      className={className}
      onClick={() => editing.add(null, button.current)}
    >
      <UserPlusIcon aria-hidden />
      {t("addToTeam")}
    </Button>
  );
}
