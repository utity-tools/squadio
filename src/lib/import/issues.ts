// docs/domain.md, "Checking rows": what a row's check finds, as codes the page words through
// next-intl. Each names its row, its column and the value it read.

/** What stops the import. */
export type ErrorCode =
  /** The row has more or fewer cells than the header. */
  | "cell-count"
  /** A cell every row needs is empty. */
  | "required"
  /** A new category, or one without a rate, needs this cell to have its whole rate. */
  | "required-for-rate"
  | "too-long"
  | "invalid-amount"
  | "invalid-percent"
  | "invalid-hours"
  /** It reads, but past its bounds: an amount the database cannot hold, social security over 100%. */
  | "out-of-range"
  /** The name repeats an earlier row of the same file. */
  | "duplicate-row"
  /** The name matches two or more that exist: the row cannot say which one it means. */
  | "ambiguous-name";

/** What the import does that the member should know of, without stopping it. */
export type WarningCode =
  /** A new category's empty social security takes the template's 31%. */
  | "template-social-security"
  /** A new category's empty other yearly costs take the template's 3,000 €. */
  | "template-other-costs"
  /** A person's category does not exist: it is created without a rate (rule k). */
  | "category-created-without-rate";

/** One finding of a row. `column` is null when it is the row's shape, not a cell. */
export type RowIssue<F extends string, C extends ErrorCode | WarningCode> = {
  row: number;
  column: F | null;
  value: string;
  code: C;
  /** For `duplicate-row`: the row it repeats. */
  earlierRow?: number;
};

export type RowStatus = "ready" | "warning" | "error";

/** A row checked: its status, what it found and, unless it has an error, what it will write. */
export type CheckedRow<F extends string, P> = {
  row: number;
  status: RowStatus;
  errors: RowIssue<F, ErrorCode>[];
  warnings: RowIssue<F, WarningCode>[];
  plan: P | null;
};

export const statusOf = (errors: readonly unknown[], warnings: readonly unknown[]): RowStatus =>
  errors.length > 0 ? "error" : warnings.length > 0 ? "warning" : "ready";
