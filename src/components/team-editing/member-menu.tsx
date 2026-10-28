"use client";

import { ArrowRightLeftIcon, EllipsisIcon, Trash2Icon, UserPlusIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useRef } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import type { TeamEditing } from "./team-editing";

export type MemberMenuProps = {
  id: string;
  editing: TeamEditing;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What had focus when the menu opened, its node, row or cell: it gets focus back on Escape. */
  owner: () => HTMLElement | null;
  /** Called when the "…" button is pressed, so the node it belongs to is the one selected. */
  onTriggerPress?: () => void;
  /**
   * `button`: a visible "…" for the pointer, out of the tab order, since Enter on the node opens
   * the menu. `anchor`: only a place for the menu to open from.
   */
  trigger: "button" | "anchor";
  className?: string;
};

/**
 * An assignment's actions (canvas brief, "Keyboard parity"): add a report, move it under someone
 * else, remove it. Controlled, so Enter on the node or row can open it.
 */
export function MemberMenu({
  id,
  editing,
  open,
  onOpenChange,
  owner,
  trigger,
  className,
  onTriggerPress,
}: MemberMenuProps) {
  const t = useTranslations("TeamEditing");
  /**
   * Set when something else decides where focus goes: an item (a dialog, or the focus manager
   * after a remove), or a click outside the menu, which lands where it was made.
   */
  const handedOver = useRef(false);
  const name = editing.nameOf(id);

  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange} modal={false}>
      <DropdownMenuTrigger asChild>
        {trigger === "button" ? (
          <button
            type="button"
            tabIndex={-1}
            aria-label={t("actions", { name })}
            onPointerDown={onTriggerPress}
            className={cn(
              "inline-flex size-6 items-center justify-center rounded-md border bg-background text-muted-foreground shadow-xs hover:bg-muted hover:text-foreground",
              className,
            )}
          >
            <EllipsisIcon aria-hidden className="size-4" />
          </button>
        ) : (
          <span aria-hidden className={cn("pointer-events-none size-0", className)} />
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        container={editing.region}
        aria-label={t("actions", { name })}
        // Radix names the menu after its trigger, which the anchor does not have.
        aria-labelledby={undefined}
        align="start"
        onInteractOutside={() => {
          handedOver.current = true;
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (!handedOver.current) owner()?.focus();
          handedOver.current = false;
        }}
      >
        <DropdownMenuItem
          onSelect={() => {
            handedOver.current = true;
            editing.add(id, owner());
          }}
        >
          <UserPlusIcon aria-hidden />
          {t("addReport")}
        </DropdownMenuItem>
        {/* Left out when there is nowhere to go: a disabled item is skipped by the arrow keys,
            so it would only puzzle the keyboard. Worked out only while the menu is open. */}
        {open && editing.canMove(id) && (
          <DropdownMenuItem
            onSelect={() => {
              handedOver.current = true;
              editing.move(id, owner());
            }}
          >
            <ArrowRightLeftIcon aria-hidden />
            {t("moveTo")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          variant="destructive"
          onSelect={() => {
            handedOver.current = true;
            editing.remove(id);
          }}
        >
          <Trash2Icon aria-hidden />
          {t("remove")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
