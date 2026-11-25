# 0016. Importing categories and people from a spreadsheet

- **Status:** accepted
- **Date:** 2026-11-25

## Context

v0.3 lets an organization enter its categories with their costs and its people by hand, one form
at a time ([domain](../domain.md#configuration-per-organization)). An organization that already
keeps them in a spreadsheet must type every row again before it sees its first estimate. v0.6 is
the faster start ([plan](../plan.md#roadmap)): import them from that spreadsheet, with a template,
a preview and a confirm that imports everything or nothing.

The owner's boards of 2026-11-05 draw it in four steps (upload, columns, review, import) over two
files, categories first and people second. The owner decided what the import holds and how it treats
people who already exist on 2026-11-25, with v0.6's plan.

## Decision

Two CSV files, read in the browser, checked row by row, and written by one Server Action in one
transaction that imports every row or none. The rules are in
[the domain](../domain.md#importing-a-spreadsheet); this records the choices behind them.

- **Two files, in order:** categories with their rates, then people. People name their category, so
  categories come first; the people step can also be reached alone, later. No committed assignments
  of other projects: they need projects and chosen scenarios behind them, and wait for evidence
  (owner, 2026-11-25).
- **CSV only, UTF-8.** Every spreadsheet tool exports it, and reading it needs no dependency that
  runs a workbook's content. Separator `;` or `,`, found from the header row; with `;` the decimal
  mark is the comma and the point groups thousands, as Spanish spreadsheets export it. At most 500
  rows per file.
- **The file never reaches the server.** The browser reads and checks it and sends only the
  matched rows, as plain values. The Server Action checks every row again with the same pure module
  and Zod, since a request can be forged, and refuses the whole import if one row fails. Nothing of
  the file is stored: no upload, no copy of the file, no import log.
- **A pure module in `src/lib/import`** reads the CSV, matches columns, parses numbers, checks rows
  and decides for each one what it will create or update. It returns codes, never text, so the
  page words them through next-intl. The page and the Server Action only call it; unit and property
  tests cover it.
- **Names are the key.** A category is found by its name and a person by theirs, ignoring case and
  surrounding spaces. A row that names an existing one updates it; an empty cell keeps what it had,
  never erases it. Two rows with the same name in one file are an error; so is a name that two
  existing people, or two existing categories, share, since the row cannot say which one it means. Updating an existing
  person is the owner's choice of 2026-11-25.
- **A rate is written whole.** A new category needs its salary and its sell rate; social security %
  and other yearly costs take the Consultancy template's values when empty, with a warning. The
  board showed an empty sell rate as a warning, but a category's cost and sell rate are written
  together (domain, "Configuration per organization"), so a new category without one is an error. An
  existing category keeps its own sell rate when the cell is empty.
- **A person's category that does not exist is created,** without a rate, so it shows as pending
  (rule k) until someone completes it. It is a warning, not an error: the import never invents a
  cost, and never writes 0.
- **Only members with rate access import:** owners and members. Categories' rates are restricted
  ([ADR 0005](0005-rate-access-in-the-database.md)) and writing people moves rule j's count, so a
  viewer is not offered it and the server refuses it ([ADR 0015](0015-roles-and-invitations.md)).
  Visitors of the demo are not offered it either: the demo stays synthetic and anonymous.
- **The error report is a CSV the browser builds** from the rows with errors: their row number, the
  matched columns only and what to fix. A column left out is dropped as the file is read, so a
  column of individual salaries is never sent, shown or written again. A cell that starts with `=`, `+`, `-`, `@`, a tab or a carriage return is
  written with a leading `'`, so a spreadsheet does not run it as a formula.

## Alternatives considered

- **Uploading the file to the server:** a file of people's names would travel and sit in a request
  log or a temporary store for no gain; the browser can read 500 rows. Refused.
- **Excel files (`.xlsx`):** a parser for them is a large dependency that reads a format able to
  carry formulas and macros. CSV is enough for categories and people. Refused for v0.6.
- **Importing the valid rows and skipping the others:** leaves an organization half imported, and a
  second try then mixes updates and creations. All or nothing is what the boards promise. Refused.
- **One file with categories and people together:** a person per row repeats the category's rate on
  every line, and the rates of one category could disagree. Refused.
- **Bringing committed assignments of other projects:** see the first decision. Deferred.

## Consequences

- A real organization can start from its spreadsheet in two uploads. Nothing new is stored, and
  rule j's warnings and pending corrections appear as they do after entering data by hand.
- Updating a category's rate costs every scenario that is not chosen with it at once; chosen
  scenarios keep their revision (rule b). The review step says how many categories and people will
  be updated.
- Two people with the same name cannot be told apart by the import. The organization renames one by
  hand, or leaves that row out.
- The column names of the template become part of the product: changing them breaks files people
  keep. They are matched in Spanish and in English, and a new name is added beside an old one, never
  instead of it.
