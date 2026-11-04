"use client";

import { CircleAlertIcon, TriangleAlertIcon } from "lucide-react";
import { Slot } from "radix-ui";
import { createContext, use } from "react";
import type * as React from "react";

import { cn } from "@/lib/utils";

type AlertTone = "warn" | "bad";

const ToneContext = createContext<AlertTone>("warn");

const tones = {
  warn: {
    box: "tint-warn border-dashed border-status-warn",
    text: "text-status-warn-text",
    Icon: TriangleAlertIcon,
  },
  bad: { box: "tint-bad border-transparent", text: "text-status-bad-text", Icon: CircleAlertIcon },
} satisfies Record<AlertTone, unknown>;

/**
 * A warning or a problem, in the smallest place that holds it (ADR 0014). It is not a live
 * region: a caller that must announce it adds role="alert" or role="status".
 */
function Alert({
  tone,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & { tone: AlertTone }) {
  const { box, text, Icon } = tones[tone];
  return (
    <ToneContext value={tone}>
      <div
        data-slot="alert"
        data-tone={tone}
        className={cn(
          "flex items-start gap-2.5 rounded-[10px] border px-3.5 py-3 text-[13px]",
          box,
          className,
        )}
        {...props}
      >
        <Icon aria-hidden="true" className={cn("mt-0.5 size-4 shrink-0", text)} />
        <div className="flex min-w-0 flex-col gap-1">{children}</div>
      </div>
    </ToneContext>
  );
}

/** The alert's title, in its tone's -text; `asChild` makes it a heading where one fits. */
function AlertTitle({
  className,
  asChild = false,
  ...props
}: React.ComponentProps<"p"> & { asChild?: boolean }) {
  const { text } = tones[use(ToneContext)];
  const Comp = asChild ? Slot.Root : "p";
  return (
    <Comp
      data-slot="alert-title"
      className={cn("text-sm font-semibold", text, className)}
      {...props}
    />
  );
}

export { Alert, AlertTitle, type AlertTone };
