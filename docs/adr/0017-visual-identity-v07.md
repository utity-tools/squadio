# 0017. Visual identity v0.7

- **Status:** accepted
- **Date:** 2026-11-26
- **Amends:** [ADR 0014](0014-visual-identity.md)

## Context

After v0.6 the owner found the app too busy: three stacked bars over the scenario editor (the app's
top bar, the scenario's header and the view bar), four KPI cards on Inicio that said little, and
pages that each laid out lists, checks and states their own way. On 2026-11-26 the owner and Claude
ran a visual lab, a local branch that was never pushed, and the owner reviewed it live, screen by
screen, in eleven rounds: the editor, the result, the history, the revision page, Inicio, the
projects and people lists, the project page, the import and the start of an organization.

Three directions were shown first as mock-ups: "Instrumento" (dense, cool grey, mono figures),
"Papel" (cream, a serif, ledger rules) and "Fichas" (one rounded face, soft shadows, a colour per
category). The owner kept only Instrumento's single bar and asked to change nothing else of
ADR 0014's look. What settled the rest was a model, not a style: **GitHub**. People who prepare and
choose staffing proposals work as a team on a repository does: "separate what they ask of me from
what this is."

The constraints of ADR 0014 hold: text 4.5:1 and UI components 3:1 in both themes, one primary
button per screen, colour never the only signal, and `src/app/theme-tokens.test.ts` checks every
pair.

## Decision

**The app follows GitHub's model and patterns, on ADR 0014's tokens with three changes: one frame,
figures in the text's face, and a colour for alternatives.**

- **The model.** A scenario is a branch, a revision a commit, an alternative a pull request, and
  choosing a revision a merge. Every scenario shows **one state chip**: Elegido (`chosen`, brand
  solid), Alternativa (`alternative`, the new purple) or Borrador (`draft`, neutral and outlined).
  The words stay the domain's ([glossary](../glossary.md)); GitHub lends the layout, never its
  vocabulary.
- **One frame.** From lg (1024 px) no page has a top bar. The sidebar is the page's banner, sticky
  at the window's height: the logo on top (the wordmark when open, the icon when folded), the
  sections, and at its foot the organization (app pages), the theme switch and the account. App
  pages show their trail above the content only when it has two crumbs or more, since one would
  repeat the heading. Below lg nothing changes: the top bar with its ☰ menu.
- **Figures in Geist with tabular digits, not Geist Mono.** This reverses ADR 0014's "figures in
  Geist Mono": the result, KPIs, tables and fields set amounts in the text's face with
  `tabular-nums`, so columns still line up. Mono stays for codes and references: an error digest,
  an invitation link, an import's column names, a formula.
- **A colour for alternatives.** `--alt` and `--alt-foreground`: a purple, as GitHub marks a pull
  request (light `oklch(0.538 0.2 300)` with white text; dark `oklch(0.72 0.15 300)` with dark text),
  for an alternative's chip, its dot in a timeline and its origin. No other colour, radius, shadow
  or motion token changes.
- **Two shared patterns.**
  - **List** (GitHub's issues): a search field; one bordered box whose grey header holds tabs with
    counts and the order and filter menus; one row per item; when the filters leave nothing,
    «Ningún … coincide» with «Quitar filtros». Projects and people use it first.
  - **Checks** (a pull request's checks and merge box): a verdict box that holds the main action;
    each issue as an annotation under its row; previous and next issue. Choosing a revision and
    reviewing an import use it.
- **«Primeros pasos»** on Inicio, as GitHub's quick setup: while an organization has steps left,
  a numbered list of them, with only the next step's action primary.

The redesign lands in eleven slices, one pull request each, from `main`: the frame and tokens,
then the list pattern, the scenario card and action bar, the history timeline, the folded result,
the bench dock, the revision page with its merge box, Inicio, the project page, the import and the
start of an organization. Each slice brings its tests and rewrites the ones it changes.

## Alternatives considered

- **Keep the top bar:** it is what stacked three bars over the editor; the sidebar already lists
  the sections, so it can carry the logo, the theme and the account too.
- **The "Papel" or "Fichas" directions:** both changed the type, colour and shape the owner
  approved in ADR 0014 without fixing what was wrong, which was layout and hierarchy.
- **Keep figures in Geist Mono:** tabular digits already align columns; mono made every figure
  look like code and set them apart from the words around them.
- **No colour for alternatives, a grey chip instead:** an alternative is something waiting for a
  decision; it needs to stand out from a draft without borrowing a status colour (green, amber and
  red belong to the margin) or the brand (which marks the chosen one).
- **Port the lab branch as it is:** it was built to be looked at, with tests broken on purpose and
  a local sign-in shortcut; clean slices with tests first keep `main`'s history and checks honest.

## Consequences

- Words that name a scenario's state, and the chips that show it, come from one place, so the
  editor, the revision, the project page and the lists cannot disagree.
- Below lg the top bar stays in the document but hidden from lg, and the sidebar is hidden below
  it: unit tests in jsdom, which applies no media queries, see both and must look inside one
  landmark.
- `--alt` and its foreground join the contrast checks in `theme-tokens.test.ts`.
- A folded sidebar hides the organization until a compact control for it exists; in the editor
  and on the revision page the scenario card shows it (slices 3 and 7).
- Data the lab found missing (who chose an older revision and when, a scenario's description,
  alternatives waiting for review on Inicio, one loader for a project's activity, filters in the
  URL) are product decisions taken before the slice that needs them, not part of this ADR.
