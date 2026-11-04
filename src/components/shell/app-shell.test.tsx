import { screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { AppShell } from "./app-shell";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// One top bar across the app, 56 px: the logo, which leads home, a separator, the trail, then
// the theme and the account. Below it, the sidebar and the page (design board "Navegación de la
// app"). Below lg the theme, the account and the sections move into the ☰ menu (boards 28–30).

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

describe("AppShell", () => {
  it("puts the logo, the trail, the theme and the account in a 56 px top bar", () => {
    renderWithIntl(
      <AppShell
        scope="app"
        crumbs={<nav aria-label="Ruta de navegación">Plan A</nav>}
        account={<button type="button">Entrar</button>}
      >
        <main>Contenido</main>
      </AppShell>,
    );

    const bar = screen.getByRole("banner");
    expect(bar).toHaveClass("min-h-14");
    expect(within(bar).getByRole("link", { name: "Squadio, Inicio" })).toHaveAttribute("href", "/");
    expect(within(bar).getByRole("navigation", { name: "Ruta de navegación" })).toBeInTheDocument();
    expect(within(bar).getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
  });

  it("hides the sidebar, the theme and the account below lg, where the ☰ menu holds them", () => {
    renderWithIntl(
      <AppShell scope="app" account={<button type="button">Entrar</button>}>
        <main />
      </AppShell>,
    );

    const bar = screen.getByRole("banner");
    expect(within(bar).getByRole("radiogroup", { name: "Tema" }).parentElement).toHaveClass(
      "max-lg:hidden",
    );
    expect(within(bar).getByRole("button", { name: "Abrir el menú" })).toHaveClass("lg:hidden");
    expect(screen.getByRole("navigation", { name: "Secciones" }).parentElement).toHaveClass(
      "max-lg:hidden",
    );
  });

  it("always offers Inicio, then the sections the page adds", () => {
    renderWithIntl(
      <AppShell scope="app" home sections={<li>Organización</li>}>
        <main />
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const home = within(nav).getByRole("link", { name: "Inicio" });
    expect(home).toHaveAttribute("href", "/");
    expect(home).toHaveAttribute("aria-current", "page");
    expect(within(nav).getByText("Organización")).toBeInTheDocument();
  });

  it("names its place, so the sidebar folds or opens as the person left it there", () => {
    const { container } = renderWithIntl(
      <AppShell scope="editor">
        <main />
      </AppShell>,
    );

    expect(container.firstChild).toHaveAttribute("data-sidebar-scope", "editor");
    expect(screen.getByRole("button", { name: "Desplegar la barra lateral" })).toBeInTheDocument();
  });
});
