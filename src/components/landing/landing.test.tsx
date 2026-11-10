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
const TITLE = "Monta el equipo. Mira el margen. Antes de firmar.";

describe("Landing", () => {
  it("says what Squadio is for in its main heading", () => {
    renderWithIntl(<Landing />);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: TITLE,
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
    const hero = screen.getByRole("region", { name: TITLE });
    expect(within(hero).getByRole("link", { name: "Probar la demo, sin cuenta" })).toHaveAttribute(
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

    const english = within(screen.getByRole("banner")).getByRole("link", {
      name: /^EN ?· English$/,
    });
    expect(english).toHaveAttribute("href", "/en");
    expect(english).toHaveAttribute("lang", "en");
    expect(english).toHaveAttribute("hreflang", "en");
  });

  it("says the demo's data is made up", () => {
    renderWithIntl(<Landing />);

    expect(screen.getByText(/Datos de ejemplo, todos ficticios/)).toBeInTheDocument();
  });

  it("leads the logo back to the landing, from the header and the footer", () => {
    renderWithIntl(<Landing />);

    for (const landmark of ["banner", "contentinfo"]) {
      expect(
        within(screen.getByRole(landmark)).getByRole("link", { name: "Squadio, inicio" }),
      ).toHaveAttribute("href", "/");
    }
  });

  it("sums the product up in four points", () => {
    renderWithIntl(<Landing />);

    const points = within(screen.getByRole("region", { name: "En pocas palabras" }));
    expect(points.getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Precio cerrado y tiempo y materiales",
      "Overhead y buffer en cada cálculo",
      "Fechas por asignación",
      "Todo se hace también con teclado",
    ]);
  });

  it("tells its story in the page's order, after how it works", () => {
    renderWithIntl(<Landing />);

    const titles = screen.getAllByRole("heading", { level: 2 }).map((title) => title.textContent);
    expect(titles).toEqual([
      "El margen se decide al montar el equipo. Y se descubre al cerrar el mes.",
      "Prueba equipos antes de comprometerlos.",
      "Pensado para cómo se prepara de verdad una propuesta.",
      "Una herramienta, tres miradas.",
      "Lo que Squadio no hace.",
      "En qué punto está.",
      "Deja de descubrir el margen a final de mes.",
    ]);
  });

  it("closes with one call, to the demo", () => {
    renderWithIntl(<Landing />);

    const close = within(
      screen.getByRole("region", { name: "Deja de descubrir el margen a final de mes." }),
    );
    expect(close.getAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([GUIDE]);
    expect(close.getByRole("link")).toHaveAccessibleName("Probar la demo, sin cuenta");
  });

  it("ends with a footer that leads to the demo, the code and the decisions", () => {
    renderWithIntl(<Landing />);

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Probar la demo" })).toHaveAttribute("href", GUIDE);
    expect(footer.getByRole("link", { name: "Código en GitHub" })).toHaveAttribute(
      "href",
      "https://github.com/utity-tools/squadio",
    );
    expect(footer.getByRole("link", { name: "Decisiones (ADR)" })).toHaveAttribute(
      "href",
      "https://github.com/utity-tools/squadio/tree/main/docs/adr",
    );
    expect(footer.getByText(/proyecto de portfolio/)).toBeInTheDocument();
  });

  it("lets the footer choose the language and the theme", () => {
    renderWithIntl(<Landing />);

    const footer = within(screen.getByRole("contentinfo"));
    const languages = within(footer.getByRole("navigation", { name: "Idioma" }));
    expect(languages.getByRole("link", { name: /^es ?· Español$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(languages.getByRole("link", { name: /^en ?· English$/ })).toHaveAttribute("href", "/en");
    expect(footer.getByRole("radio", { name: "Sistema" })).toBeInTheDocument();
  });

  it("leads from the header to every section it names, in the page's order", () => {
    renderWithIntl(<Landing />);

    const nav = within(screen.getByRole("navigation", { name: "Principal" }));
    const links = nav.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Producto", "#producto"],
      ["Cómo funciona", "#como"],
      ["Principios", "#principios"],
      ["Hoja de ruta", "#hoja"],
    ]);
    for (const link of links) {
      expect(document.getElementById(link.getAttribute("href")?.slice(1) ?? "")).not.toBeNull();
    }
  });

  it("announces what is new above the title and leads to the step that shows it", () => {
    renderWithIntl(<Landing />);

    const hero = within(screen.getByRole("region", { name: TITLE }));
    const news = hero.getByRole("link", {
      name: "Nuevo Resultados parciales: si falta un dato, ves qué cifras quedan pendientes",
    });
    expect(news).toHaveAttribute("href", "#parciales");
    expect(document.getElementById("parciales")).toHaveTextContent("Sabe qué falta");
  });

  it("offers to see how it works next to the hero's call", () => {
    renderWithIntl(<Landing />);

    const hero = within(screen.getByRole("region", { name: TITLE }));
    expect(hero.getByRole("link", { name: "Ver cómo funciona" })).toHaveAttribute("href", "#como");
  });

  it("leads to how it works and to the roadmap from the footer", () => {
    renderWithIntl(<Landing />);

    const footer = within(screen.getByRole("contentinfo"));
    expect(footer.getByRole("link", { name: "Cómo funciona" })).toHaveAttribute("href", "#como");
    expect(footer.getByRole("link", { name: "Hoja de ruta" })).toHaveAttribute("href", "#hoja");
  });
});
