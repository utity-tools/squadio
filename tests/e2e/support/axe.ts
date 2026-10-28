import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

// WCAG 2.2 AA plus axe's best practices (landmarks, one h1, page titles).
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Fails the test with axe's report when the page has any detectable violation. */
export async function expectNoAxeViolations(page: Page) {
  // Colours mid-transition (a theme just applied) would give contrast ratios no one sees for
  // long; endless animations (a loading pulse) never settle and do not count. A transition only
  // shows in getAnimations() once a frame has styled it, so two frames go by first.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Infinity,
      ),
  );
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(results.violations).toEqual([]);
}
