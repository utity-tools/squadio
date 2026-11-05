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

  it("keeps only the parent crumb on phones, as a link back, so the bar stays 56 px", () => {
    renderWithIntl(
      <Breadcrumbs
        items={[
          { label: "Proyectos", href: "/projects" },
          { label: "Customer portal", href: "/projects/p1" },
          { label: "Plan A" },
        ]}
      />,
    );

    const crumbs = screen.getAllByRole("listitem");
    expect(crumbs[0]).toHaveClass("max-sm:hidden");
    expect(crumbs[1]).not.toHaveClass("max-sm:hidden");
    expect(crumbs[2]).toHaveClass("max-sm:hidden");
    const back = screen.getByRole("link", { name: "Customer portal" });
    expect(back).toHaveClass("max-sm:truncate");
    expect(crumbs[1]?.querySelector("svg.lucide-chevron-left")).toHaveClass("sm:hidden");
    expect(crumbs[1]?.querySelector("svg.lucide-chevron-right")).toHaveClass("max-sm:hidden");
  });

  it("keeps a parent without a page on phones, with no arrow back", () => {
    renderWithIntl(<Breadcrumbs items={[{ label: "Portal" }, { label: "Plan A" }]} />);

    const crumbs = screen.getAllByRole("listitem");
    expect(crumbs[0]).not.toHaveClass("max-sm:hidden");
    expect(crumbs[0]?.querySelector("svg.lucide-chevron-left")).toBeNull();
    expect(crumbs[1]).toHaveClass("max-sm:hidden");
  });

  it("keeps a lone crumb on phones", () => {
    renderWithIntl(<Breadcrumbs items={[{ label: "Proyectos" }]} />);

    expect(screen.getByRole("listitem")).not.toHaveClass("max-sm:hidden");
  });
});
