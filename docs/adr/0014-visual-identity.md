# 0014. Visual identity

- **Status:** accepted
- **Date:** 2026-11-04

## Context

Squadio still wore shadcn's zinc theme as it ships. It is clear and accessible, but it has no
identity, and the owner found it bland. On 2026-11-03 the owner and Claude redesigned the app on a
private design canvas, outside the repo, so the design could be judged before any code: brand,
status colours, type, shape, depth, motion and navigation. The owner took the decisions below
there, and approved bringing them in on 2026-11-04, when the canvas, "Squadio · rediseño y sistema
de diseño", also settled the primary button.

Two constraints hold. The contrast targets of the
[canvas brief](../design/canvas-brief.md#themes-and-contrast) stay: text 4.5:1, UI components 3:1,
in both themes. And the status colours used to do two jobs with one token: the same green drew the
margin's badge and could colour a word on the page, so it had to be dark enough for text and was
dull as a fill.

## Decision

**Keep shadcn and theme it.** The tokens change; the components stay shadcn's.

- **Brand:** a periwinkle, `#4E6FF3`, as `--brand` for the logo, icons and fills (3:1). Words in
  the brand colour use `--brand-text` (`#3D5BE0` in light, `#8EA2F8` in dark, 4.5:1), and
  `--brand-soft` (`#D9DEFC`) is a pale fill. `--brand-solid` (`#3D5BE0`, white text) fills **the one
  primary button per screen**, the selection (a selected tree card's border) and the "Elegido" chip;
  `--brand-solid-hover` darkens it in light and lightens it in dark, keeping 4.5:1. The brand never
  colours the margin's status, which stays green, amber or red. `--scrim` veils what sits behind a
  dialog.
- **The logo is a placeholder** until the owner settles it: an icon in `--brand` and the word
  "squadio" in Plus Jakarta Sans, in one component, so the real logo replaces a single file. The
  palette above stays until then; a new logo may change `--brand` and its pairs.
- **Status colours from Google's palette, each split in two:** a fill, `--status-ok` `#34A853`,
  `--status-warn` `#E8710A`, `--status-bad` `#D93025`, for icons, bars and badges (3:1), with its
  `-foreground` for text on the fill; and `--status-*-text`, `#137333`, `#A35200`, `#C5221F` in
  light, for words on the page, the card and the status's own 12 % tint (4.5:1). In dark, one
  lighter tone serves both. Colour is still never the only signal.
- **Type:** headings (`h1` to `h3`) in **Plus Jakarta Sans**, a touch tighter than the text; text
  stays in Geist and figures in Geist Mono. The owner rejected Outfit.
- **Shape:** radii of 6, 8, 10 and 14 px, which the existing `--radius` already gives.
- **Depth means something:** what can be dragged or floats has a shadow (`shadow-xs` to
  `shadow-lg`, from the theme's elevations, darker in dark, where a lifted surface also catches a
  hairline of light); structure such as bars, tables and the summary is drawn with borders.
- **Motion:** four durations, 120 ms for a press, 180 ms for a hover, 240 ms for a layout change and
  400 ms for a counting figure, and one curve, `ease-snappy`. Every transition and animation stops
  for people who ask for reduced motion.
- **Empty states use the logo's squares, never people.**

The look of the shape, depth and motion follows data-dense CRMs such as Attio, with our own values.
`src/app/theme-tokens.test.ts` checks every colour pair, the tints included, in both themes.

Navigation (a top bar and a sidebar) and the redesigned pages come in their own pull requests on
these tokens.

## Alternatives considered

- **A custom component library instead of shadcn:** more identity, but much more to build and keep
  accessible for a portfolio project; theming shadcn gets most of the identity for little code.
- **One token per status, made more vivid:** a vivid green fails 4.5:1 as text on white, so either
  the badges stay dull or words in status colours fail contrast. Two tokens per status avoid both.
- **Neutral primary buttons (shadcn's near-black):** they hide the brand and make the one action
  that matters on a screen look like the rest. Brand buttons, one per screen and never the
  margin's status, keep the action clear without competing with green, amber and red.
- **Outfit for headings:** the owner preferred Plus Jakarta Sans.

## Consequences

- Words in a status colour must use `text-status-*-text`, not `text-status-*`; today every status
  use is a fill (icons, bars, borders, the margin's badge), so nothing changes meaning.
- In light, the margin's green and amber badges now carry dark text on a vivid fill.
- Tailwind's `shadow-*` utilities draw the theme's elevations, so existing shadows change a little.
- A third web font loads on every page; `next/font` self-hosts it, so no request goes to Google.
- Each screen has at most one primary button; the others are outline or ghost.
- When the logo changes, `--brand` and its pairs may change with it; the tests will catch a pair
  that loses contrast.
