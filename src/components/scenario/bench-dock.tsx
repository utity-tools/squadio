"use client";

import { ChevronsDownIcon, ChevronsUpIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { type ReactNode, useEffect, useRef, useState } from "react";

import { useDragState } from "@/components/team-drag/team-drag";
import { cn } from "@/lib/utils";

/** Whether an element matches a selector, false where the browser cannot tell (as in jsdom). */
function matches(element: Element, selector: string) {
  try {
    return element.matches(selector);
  } catch {
    return false;
  }
}

/**
 * The bench docked under the team from lg (ADR 0017): only its row of title, filters and "Add to
 * team…" peeks out. It rises over the canvas while the pointer or the keyboard's focus is in it,
 * not on a mouse click, and the handle on its top edge raises it to three quarters of the team's
 * height and keeps it there until pressed again. Escape folds it, however it rose, until the
 * pointer or the focus moves on (WCAG 1.4.13). While a drag goes on it folds to its row, so the
 * whole canvas takes the drop. Focusable, so the keyboard can open and scroll it.
 */
export function BenchDock({ label, children }: { label: string; children: ReactNode }) {
  const t = useTranslations("ScenarioPage");
  const [tall, setTall] = useState(false);
  // Folded by Escape, whatever the pointer or the focus say, until either moves on.
  const [dismissed, setDismissed] = useState(false);
  const dragging = useDragState().dragged !== null;
  const dock = useRef<HTMLElement>(null);
  const handle = useRef<HTMLButtonElement>(null);
  const held = dragging || dismissed;
  const up = tall && !held;
  const name = tall ? t("benchLower") : t("benchRaise");

  // Folded, the row shows from the top: a bench scrolled while open starts again from there.
  useEffect(() => {
    if (held && dock.current) dock.current.scrollTop = 0;
  }, [held]);

  useEffect(() => {
    const aside = dock.current;
    if (!aside) return;
    const rewind = () => {
      if (tall) return;
      const open =
        matches(aside, ":hover") || matches(aside, ":focus-visible, :has(:focus-visible)");
      if (!open) aside.scrollTop = 0;
    };
    // Native events follow the DOM: they come from "Add to team…", which the team's views draw
    // into the bench, and not from the dialogs drawn in the body.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented || dismissed) return;
      const focused = aside.contains(document.activeElement);
      if (!focused && !matches(aside, ":hover")) return;
      event.preventDefault();
      // The focus first: it moving on would end the dismissal.
      if (tall && focused) handle.current?.focus();
      setTall(false);
      setDismissed(true);
    };
    const onFocusIn = () => setDismissed(false);
    const onFocusOut = (event: FocusEvent) => {
      if (event.relatedTarget instanceof Node && aside.contains(event.relatedTarget)) return;
      setDismissed(false);
      rewind();
    };
    // While the focus stays in it, the focus moving on is what ends the dismissal.
    const onPointerLeave = () => {
      if (!aside.contains(document.activeElement)) setDismissed(false);
      rewind();
    };
    document.addEventListener("keydown", onKeyDown);
    aside.addEventListener("focusin", onFocusIn);
    aside.addEventListener("focusout", onFocusOut);
    aside.addEventListener("pointerleave", onPointerLeave);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      aside.removeEventListener("focusin", onFocusIn);
      aside.removeEventListener("focusout", onFocusOut);
      aside.removeEventListener("pointerleave", onPointerLeave);
    };
  }, [tall, dismissed]);

  return (
    <aside
      ref={dock}
      aria-label={label}
      tabIndex={0}
      data-tall={tall || undefined}
      className={cn(
        "group/dock absolute inset-x-0 bottom-0 z-10 hidden border-t bg-background px-4 pb-4 transition-[height,box-shadow] duration-(--duration-layout) ease-snappy focus-visible:-outline-offset-2 motion-reduce:transition-none lg:block",
        // Not a scroll container while folded, so its row never stays scrolled out of view.
        up ? "h-3/4 overflow-y-auto shadow-lg" : "h-14 overflow-clip",
        !up &&
          !held &&
          "hover:h-72 hover:overflow-y-auto hover:shadow-lg focus-visible:h-72 focus-visible:overflow-y-auto focus-visible:shadow-lg has-[:focus-visible]:h-72 has-[:focus-visible]:overflow-y-auto has-[:focus-visible]:shadow-lg",
        // A drag folds it at once, so the canvas under it takes the drop.
        dragging && "transition-none",
      )}
    >
      {/*
        The handle's row stays on top while the bench scrolls, and stands for its top padding:
        taller while the bench is open, to leave the handle its room.
      */}
      <div
        className={cn(
          "sticky top-0 z-10 h-3 transition-[height] duration-(--duration-layout) ease-snappy motion-reduce:transition-none",
          up && "h-6",
          !up &&
            !held &&
            "group-hover/dock:h-6 group-focus-visible/dock:h-6 group-has-[:focus-visible]/dock:h-6",
        )}
      >
        {/*
          A grip on the top edge: shown while the bench is open, and to the keyboard's focus. The
          button fills the open row, 24 px high, so it is a large enough target (WCAG 2.5.8); the
          grip drawn inside it is smaller, and the focus ring is drawn inside, where the row's
          top edge does not clip it.
        */}
        <button
          ref={handle}
          type="button"
          aria-expanded={tall}
          aria-label={name}
          title={name}
          onClick={() => setTall(!tall)}
          className={cn(
            "absolute top-0 left-1/2 flex h-6 w-14 -translate-x-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity duration-(--duration-fast) group-hover/dock:opacity-100 group-focus-visible/dock:opacity-100 group-has-[:focus-visible]/dock:opacity-100 hover:text-foreground focus-visible:opacity-100 focus-visible:-outline-offset-2 motion-reduce:transition-none",
            tall && "opacity-100",
          )}
        >
          <span className="flex h-4 w-12 items-center justify-center rounded-md border border-input bg-background">
            {tall ? (
              <ChevronsDownIcon aria-hidden className="size-3.5" />
            ) : (
              <ChevronsUpIcon aria-hidden className="size-3.5" />
            )}
          </span>
        </button>
      </div>
      {children}
    </aside>
  );
}
