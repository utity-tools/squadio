"use client";

import type { VariantProps } from "class-variance-authority";
import * as React from "react";
import { AlertDialog as AlertDialogPrimitive } from "radix-ui";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// The design's interrupting windows (Errors board, section 4): unlike a Dialog, an outside click
// does not close one, and the focus starts on its action. Only its buttons, and Escape where the
// caller allows it, let the person go on.

function AlertDialog({ ...props }: React.ComponentProps<typeof AlertDialogPrimitive.Root>) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />;
}

function AlertDialogContent({
  className,
  onOpenAutoFocus,
  onCloseAutoFocus,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Content>) {
  // Where the focus was when it interrupted, to go back there: Radix returns it to a trigger, and
  // a window that opens by itself has none.
  const before = React.useRef<HTMLElement | null>(null);
  return (
    <AlertDialogPrimitive.Portal>
      <AlertDialogPrimitive.Overlay
        data-slot="alert-dialog-overlay"
        className="fixed inset-0 z-50 animate-scrim-in bg-scrim"
      />
      <AlertDialogPrimitive.Content
        data-slot="alert-dialog-content"
        // As a Dialog's confirmation (ADR 0014): 440 px over --scrim, radius 14, the largest
        // shadow, the gentle entrance that reduced motion stills.
        className={cn(
          "fixed top-[50%] left-[50%] z-50 grid max-h-[calc(100%-3rem)] w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] animate-dialog-in gap-5 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-lg outline-none sm:max-w-[440px]",
          className,
        )}
        // Radix starts on a Cancel; the design starts on the action, the one way on.
        onOpenAutoFocus={(event) => {
          // Nothing to go back to when nothing had the focus: Radix's own return then applies.
          const active = document.activeElement;
          before.current =
            active instanceof HTMLElement && active !== document.body ? active : null;
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          const action = (event.currentTarget as HTMLElement).querySelector<HTMLElement>(
            "[data-slot=alert-dialog-action]",
          );
          if (!action) return;
          event.preventDefault();
          action.focus();
        }}
        onCloseAutoFocus={(event) => {
          onCloseAutoFocus?.(event);
          if (event.defaultPrevented || !before.current?.isConnected) return;
          event.preventDefault();
          before.current.focus();
        }}
        {...props}
      />
    </AlertDialogPrimitive.Portal>
  );
}

const tones = {
  warn: "tint-warn text-status-warn-text",
  muted: "bg-muted text-muted-foreground",
} as const;

/** The icon on its tint, then the title and the text beside it. */
function AlertDialogHeader({
  className,
  icon,
  tone = "warn",
  children,
  ...props
}: React.ComponentProps<"div"> & { icon: React.ReactNode; tone?: keyof typeof tones }) {
  return (
    <div
      data-slot="alert-dialog-header"
      className={cn("flex items-start gap-3.5", className)}
      {...props}
    >
      <span
        data-slot="alert-dialog-icon"
        aria-hidden
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg:not([class*='size-'])]:size-[18px]",
          tones[tone],
        )}
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-2">{children}</div>
    </div>
  );
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      // The secondary action first and the one primary last, as in a Dialog.
      className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
      {...props}
    />
  );
}

function AlertDialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Title>) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-base leading-snug font-semibold", className)}
      {...props}
    />
  );
}

function AlertDialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Description>) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

type ButtonLook = Pick<VariantProps<typeof buttonVariants>, "variant">;

/** The primary way on, where the focus starts; with `asChild`, a link styled as the button. */
function AlertDialogAction({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Action> & ButtonLook) {
  return (
    <AlertDialogPrimitive.Action
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

/** A secondary way on, drawn before the action. */
function AlertDialogCancel({
  className,
  variant = "outline",
  ...props
}: React.ComponentProps<typeof AlertDialogPrimitive.Cancel> & ButtonLook) {
  return (
    <AlertDialogPrimitive.Cancel
      data-slot="alert-dialog-cancel"
      className={cn(buttonVariants({ variant }), className)}
      {...props}
    />
  );
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
};
