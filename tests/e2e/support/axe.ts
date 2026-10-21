import AxeBuilder from "@axe-core/playwright";
import { type Page, expect } from "@playwright/test";

// WCAG 2.2 AA plus axe's best practices (landmarks, one h1, page titles).
const tags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

/** Fails the test with axe's report when the page has any detectable violation. */
export async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(tags).analyze();
  expect(results.violations).toEqual([]);
}
