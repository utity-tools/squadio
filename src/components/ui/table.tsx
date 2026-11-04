import type * as React from "react";

import { cn } from "@/lib/utils";

// ADR 0014: 36 px rows, the header on --muted, numbers right-aligned in mono.

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn(
        "w-full border-separate border-spacing-0 overflow-hidden rounded-[12px] border text-[13px]",
        className,
      )}
      {...props}
    />
  );
}

function TableHeader(props: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&>tr:last-child>td]:border-b-0", className)}
      {...props}
    />
  );
}

type RowProps = React.ComponentProps<"tr"> & {
  /** On --selected. The caller says it to assistive technologies too (aria-selected). */
  selected?: boolean;
  /** A total: bold, on --muted. */
  total?: boolean;
};

function TableRow({ className, selected = false, total = false, ...props }: RowProps) {
  return (
    <tr
      data-slot="table-row"
      data-selected={selected || undefined}
      data-total={total || undefined}
      className={cn(
        selected && "[&>td]:bg-selected [&>td]:text-selected-foreground",
        total && "font-semibold [&>td]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

type CellProps = { numeric?: boolean };

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & CellProps) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-9 border-b bg-muted px-3 font-medium whitespace-nowrap text-muted-foreground",
        numeric ? "text-right" : "text-left",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & CellProps) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-9 border-b px-3 py-1.5 align-middle",
        numeric && "text-right font-mono whitespace-nowrap tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

export { Table, TableBody, TableCell, TableHead, TableHeader, TableRow };
