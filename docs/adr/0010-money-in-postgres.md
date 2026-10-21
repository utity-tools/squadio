# 0010. Money in Postgres: euros in `numeric(12,2)`, integer cents in TypeScript

- **Status:** accepted
- **Date:** 2026-10-21

## Context

[ADR 0002](0002-cost-model.md) keeps money in integer cents and rounds once per result line;
[domain rule g](../domain.md#rules) adds that Postgres stores it as `numeric`. The review of the
database foundation ([0001](../reviews/0001-database-foundation.md), decision E) left open what that
`numeric` holds and how it reaches TypeScript, and asked for an answer before the first money
column. The first restricted tables (v0.2) need it now.

Three forces matter:

- **Exactness.** `node-postgres` returns `numeric` as a string, precisely so that no value passes
  through a binary float. `parseFloat("0.29") * 100` is `28.999999999999996`: one careless
  conversion turns cents into the wrong cents, and sums drift.
- **Readability in SQL.** Seeds, migrations, database tests and anyone reading a table with `psql`
  see the stored value. `52000.00` reads as a salary; `5200000` needs a comment.
- **Percentages carry money too.** Social security, overhead, buffer and target margin multiply
  money, so they need the same exactness, and they live in restricted tables
  ([ADR 0005](0005-rate-access-in-the-database.md)). Allocation also multiplies hours, but it holds
  no money and sits on the open `Assignment` entity.

## Decision

Postgres stores euros with two decimals; TypeScript only ever sees integer cents, converted by one
custom Drizzle column type that never uses floats.

- **Money columns are `numeric(12,2)`, in euros.** Twelve digits hold up to 9,999,999,999.99 €,
  far above any rate, price or cost here, and well inside JavaScript's safe integers once in cents
  (about 9 × 10¹⁵). EUR only, as rule g says.
- **A custom Drizzle type, `moneyCents`, maps them to integer cents.** Reading, it parses pg's
  string (`"-1234.50"`) with string operations: sign, euros and the two decimal digits become one
  integer. Writing, it formats an integer back into the same string. It rejects anything else: a
  non-integer, an unsafe integer, or a string that is not a plain two-decimal number. No `Number()`
  of a decimal string, no `parseFloat`, no multiplication by 100.
- **Money-bearing percentages are `numeric(5,2)` in restricted tables and basis points in
  TypeScript.** 31.00% is stored as `31.00` and read as `3100`. A twin type, `basisPoints`, uses the
  same conversion, since a two-decimal percentage and a two-decimal euro amount are both integer
  hundredths. This covers social security, overhead, buffer and target margin, in `CategoryRate`,
  `CostConfig` and `ProjectPricing`.
- **Allocation is an integer from 0 to 100** on `Assignment`, enforced by a check constraint. It
  holds no money, so it is not `numeric` and stays outside the restricted tables, as ADR 0005's
  guard test requires.
- **Property-tested round trip.** A fast-check test checks that every safe integer in range
  survives `moneyCents` (and `basisPoints`) to string and back unchanged, and that the string is
  what Postgres prints for that value. A database test checks the same round trip through a real
  `numeric(12,2)` column, including negative amounts and values with a zero decimal (`"10.50"`,
  `"7.00"`).
- **Calculations stay in TypeScript.** The costing engine takes cents and basis points and rounds
  once per result line (rule g). Postgres stores inputs; it does not compute results.

## Alternatives considered

- **Cents in `numeric` (`numeric(14,0)`):** exact, and the conversion is trivial, but every number
  in SQL, seeds and database tests is a hundred times what it means, and a value entered in euros by
  mistake is silently off by a factor of 100. Euros keep the database readable and the conversion is
  a single, tested function.
- **`bigint` cents:** exact and fast, and pg could even return it as a number. But ADR 0005's guard
  recognises money by its `numeric` type, so money in `bigint` would hide from it; the readability
  cost of cents in SQL applies too.
- **`numeric` read as a JavaScript float** (Drizzle's `mode: "number"`, or `parseFloat`): the
  simplest code, and the bug the string representation exists to prevent. Rejected.
- **A decimal library in TypeScript** (such as `decimal.js`): exact, but every calculation would
  go through its API instead of plain integers, and ADR 0002 already chose integer cents.

## Consequences

- The conversion lives in one place, with property tests; columns declared with Drizzle's plain
  `numeric` are a review finding.
- Percentages need more precision than two decimals only if an organization asks for it; widening
  `numeric(5,2)` and moving to a finer unit than basis points would be a migration and a change to
  `basisPoints`, nothing else.
- The rounding mode of each result line is not decided here; it is set in `docs/domain.md` with the
  costing engine.
- Review decision E is closed.
