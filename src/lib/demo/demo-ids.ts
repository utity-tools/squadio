// Fixed ids of the demo organization's rows, so links to the demo keep working after a reseed.

/** The id of the demo row numbered `n`. */
export const demoId = (n: number) => `6d656d6f-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Plan A, the guide case team: where the home page and the README send visitors. */
export const GUIDE_SCENARIO_ID = demoId(200);
