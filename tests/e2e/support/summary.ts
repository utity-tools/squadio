import { type Page, expect } from "@playwright/test";

// v0.7, "Folded result": at a glance the statement shows revenue, total cost and the net margin;
// every other line, and staff cost by category, folds under «Ver desglose (N líneas)».

/** Opens the summary rail's «Ver desglose», so its folded lines can be read. */
export async function openBreakdown(page: Page) {
  const label = page.getByText(/^Ver desglose \(\d+ líneas?\)$/);
  const details = page
    .getByRole("complementary", { name: "Resumen" })
    .locator("details", { has: label });
  if ((await details.getAttribute("open")) === null) await label.click();
  await expect(details).toHaveAttribute("open", "");
}
