import { type Locator, expect } from "@playwright/test";

/**
 * Waits until React has hydrated an element, so its handlers run: a key or focus that lands
 * earlier reaches the server's HTML only and is lost. React keeps its props on the DOM node.
 */
export async function expectHydrated(element: Locator) {
  await expect
    .poll(() =>
      element.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactProps$"))),
    )
    .toBe(true);
}
