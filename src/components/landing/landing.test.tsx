import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { Landing } from "./landing";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    locale,
    children,
    ...props
  }: { href: string; locale?: string; children: React.ReactNode } & Record<string, unknown>) => (
    <a href={locale === "en" ? `/en${href === "/" ? "" : href}` : href} {...props}>
      {children}
    </a>
  ),
}));

const GUIDE = "/scenarios/6d656d6f-0000-4000-8000-000000000200";

describe("Landing", () => {
  it("says what Squadio is for in its main heading", () => {
    renderWithIntl(<Landing />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Monta el equipo. Mira el margen. Antes de firmar.",
      }),
    ).toBeInTheDocument();
  });

  it("speaks the locale of the page", () => {
    renderWithIntl(<Landing />, { locale: "en" });

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Build the team. See the margin. Before you sign.",
      }),
    ).toBeInTheDocument();
  });

  it("leads to the demo's guide scenario from the header and from the hero", () => {
    renderWithIntl(<Landing />);

    const banner = screen.getByRole("banner");
    expect(within(banner).getByRole("link", { name: "Probar la demo" })).toHaveAttribute(
      "href",
      GUIDE,
    );
    expect(screen.getByRole("link", { name: "Probar la demo, sin cuenta" })).toHaveAttribute(
      "href",
      GUIDE,
    );
  });

  it("offers to sign in", () => {
    renderWithIntl(<Landing />);

    expect(
      within(screen.getByRole("banner")).getByRole("link", { name: "Entrar" }),
    ).toHaveAttribute("href", "/sign-in");
  });

  it("switches to the other language, named in that language", () => {
    renderWithIntl(<Landing />);

    const english = screen.getByRole("link", { name: /^EN ?· English$/ });
    expect(english).toHaveAttribute("href", "/en");
    expect(english).toHaveAttribute("lang", "en");
    expect(english).toHaveAttribute("hreflang", "en");
  });

  it("says the demo's data is made up", () => {
    renderWithIntl(<Landing />);

    expect(screen.getByText(/Datos de ejemplo, todos ficticios/)).toBeInTheDocument();
  });

  it("leads the logo back to the landing", () => {
    renderWithIntl(<Landing />);

    expect(screen.getByRole("link", { name: "Squadio, inicio" })).toHaveAttribute("href", "/");
  });
});
