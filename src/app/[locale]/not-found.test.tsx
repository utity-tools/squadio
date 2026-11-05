import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";
import { GUIDE_SCENARIO_ID } from "@/lib/demo/demo-ids";

import NotFound from "./not-found";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Board «Errores», 2: the page not found keeps a header to go on from, the logo with its top
// square gone, and two ways out.

describe("NotFound", () => {
  it("says the page was not found, without saying whether anything exists there", () => {
    renderWithIntl(<NotFound />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No encontramos esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Error 404");
  });

  it("links back to the home page, from the button and from the logo", () => {
    renderWithIntl(<NotFound />, { locale: "en" });

    expect(screen.getByRole("link", { name: "Back to the home page" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("link", { name: "Squadio" }),
    );
  });

  it("offers the demo as a second way out", () => {
    renderWithIntl(<NotFound />);

    expect(screen.getByRole("link", { name: "Abrir la demo" })).toHaveAttribute(
      "href",
      `/scenarios/${GUIDE_SCENARIO_ID}`,
    );
  });

  it("draws the logo with its top square missing", () => {
    renderWithIntl(<NotFound />);

    expect(document.querySelector('[data-art="missing"]')).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<NotFound />);

    await expectNoAxeViolations();
  });
});
