import axe from "axe-core";
import { expect } from "vitest";

// axe in jsdom for components E2E cannot reach, such as what a signed-in account sees (E2E never
// signs in): the E2E's WCAG 2.2 AA tags and best practices, on the whole document, so menus and
// dialogs portalled out of the component are checked too. jsdom lays nothing out, so contrast
// stays with E2E and the token tests. The rules about a whole page (its title, lang, landmarks and
// one h1) are E2E's too: a component alone has none of them.
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Fails the test with axe's report when the document has any detectable violation. */
export async function expectNoAxeViolations() {
  const results = await axe.run(document, {
    runOnly: { type: "tag", values: tags },
    rules: Object.fromEntries(
      [
        "color-contrast",
        "document-title",
        "html-has-lang",
        "landmark-one-main",
        "page-has-heading-one",
        "region",
      ].map((rule) => [rule, { enabled: false }]),
    ),
  });
  expect(
    results.violations.map(({ id, nodes }) => ({ id, nodes: nodes.map((node) => node.html) })),
  ).toEqual([]);
}
