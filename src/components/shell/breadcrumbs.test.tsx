import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { Breadcrumbs } from "./breadcrumbs";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The top bar's trail (design board "Escenario completo"): 13 px, muted, links where a page
// exists, and the last crumb is the current page.

describe("Breadcrumbs", () => {
  it("lists the trail in a named navigation and marks the last crumb as the current page", () => {
    renderWithIntl(
      <Breadcrumbs
        items={[{ label: "Inicio", href: "/" }, { label: "Portal (Acme)" }, { label: "Plan A" }]}
      />,
    );

    const nav = screen.getByRole("navigation", { name: "Ruta de navegación" });
    const crumbs = within(nav).getAllByRole("listitem");
    expect(crumbs.map((crumb) => crumb.textContent)).toEqual(["Inicio", "Portal (Acme)", "Plan A"]);
    expect(within(nav).getByRole("link", { name: "Inicio" })).toHaveAttribute("href", "/");
    expect(within(nav).getByText("Plan A")).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByText("Portal (Acme)")).not.toHaveAttribute("aria-current");
  });

  it("gives the current page no link, even with an address", () => {
    renderWithIntl(<Breadcrumbs items={[{ label: "Tu organización", href: "/organization" }]} />);

    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Tu organización")).toHaveAttribute("aria-current", "page");
  });
});
