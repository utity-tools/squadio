import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";
import { Slot } from "radix-ui";

const buttonVariants = cva(
  // ADR 0014: 36 px, radius 8, a 120 ms press on the snappy curve, still for reduced motion.
  "inline-flex shrink-0 items-center justify-center gap-2 rounded-md border border-transparent text-sm font-medium whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-(--duration-fast) ease-snappy active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 aria-disabled:active:scale-100 aria-invalid:border-destructive aria-invalid:ring-destructive/20 motion-reduce:transition-none motion-reduce:active:scale-100 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        // The one primary action per screen, in the brand (ADR 0014). It keeps its fill while it
        // waits, so a waiting button does not look ready on hover.
        default:
          "bg-brand-solid text-brand-solid-foreground hover:bg-brand-solid-hover aria-disabled:hover:bg-brand-solid",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border-input bg-background text-foreground hover:bg-muted",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "text-foreground hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-3.5 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-md px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7.5 gap-1.5 px-2.5 text-[13px] has-[>svg]:px-2",
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-md [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  }) {
  const Comp = asChild ? Slot.Root : "button";

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
