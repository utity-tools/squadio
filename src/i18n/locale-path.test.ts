import { describe, expect, it } from "vitest";

import { pathInLocale } from "./locale-path";

// The language switch in the account menu keeps the page and its query: it takes the locale's
// prefix off the browser's path (Spanish has none, English is under /en) and lets next-intl put
// the other one on.

describe("pathInLocale", () => {
  it.each([
    ["/", "", "/"],
    ["/scenarios/abc", "?view=table", "/scenarios/abc?view=table"],
    ["/en", "", "/"],
    ["/en/", "", "/"],
    ["/en/organization", "", "/organization"],
    ["/en/scenarios/abc", "?access=none", "/scenarios/abc?access=none"],
    ["/english-page", "", "/english-page"],
    ["/es/organization", "", "/es/organization"],
  ])("%s%s → %s", (pathname, search, expected) => {
    expect(pathInLocale(pathname, search)).toBe(expected);
  });
});
