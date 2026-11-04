"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { XIcon } from "lucide-react";
import { Dialog as SheetPrimitive } from "radix-ui";

// Written by hand on Radix Dialog, like dialog.tsx: shadcn's CLI once pulled a bogus npm `cn`
// package into the project. A modal side panel against the window's end edge (design board 29,
// "Menú"): it traps the focus, closes with Escape and gives the focus back to its trigger.

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn("fixed inset-0 z-50 animate-scrim-in bg-scrim", className)}
      {...props}
    />
  );
}

function SheetContent({
  className,
  children,
  closeLabel,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  /** The close button's name, translated by the caller; without one there is no close button. */
  closeLabel?: string;
}) {
  return (
    <SheetPrimitive.Portal data-slot="sheet-portal">
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        className={cn(
          // 300 px, or the window less a 48 px strip of the page; the safe areas stay clear. It
          // slides in from its edge in 240 ms, and the global reduced-motion rule stills it.
          "fixed inset-y-0 end-0 z-50 flex w-[min(300px,calc(100%-3rem))] animate-sheet-in flex-col gap-4 overflow-y-auto border-s bg-popover ps-4 pe-[max(1rem,env(safe-area-inset-right))] pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))] text-popover-foreground shadow-lg outline-none",
          className,
        )}
        {...props}
      >
        {/* First in the DOM, as it is first on screen: the focus order follows what one sees. */}
        {closeLabel && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            className="absolute end-2 top-[max(0.25rem,env(safe-area-inset-top))] inline-flex size-11 items-center justify-center rounded-md text-muted-foreground transition-colors duration-(--duration-fast) hover:bg-accent hover:text-foreground motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:size-5 [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">{closeLabel}</span>
          </SheetPrimitive.Close>
        )}
        {children}
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-base font-semibold", className)}
      {...props}
    />
  );
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetOverlay,
  SheetTitle,
  SheetTrigger,
};
