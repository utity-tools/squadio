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

let wide = false;
const medias: { query: string; matches: boolean; listeners: Set<() => void> }[] = [];

beforeEach(() => {
  wide = false;
  medias.length = 0;
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => {
      const media = { query, matches: wide, listeners: new Set<() => void>() };
      medias.push(media);
      return {
        get matches() {
          return media.matches;
        },
        addEventListener: (_: string, listener: () => void) => media.listeners.add(listener),
        removeEventListener: (_: string, listener: () => void) => media.listeners.delete(listener),
      };
    }),
  );
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
    expect(within(bar).getByRole("link", { name: "Squadio, Inicio" })).toHaveAttribute(
      "href",
      "/home",
    );
    expect(within(bar).getByRole("navigation", { name: "Ruta de navegación" })).toBeInTheDocument();
    expect(within(bar).getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Entrar" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
  });

  it("says in the editor, right under the top bar, when the connection is down", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(
      <AppShell scope="editor">
        <main>Contenido</main>
      </AppShell>,
    );

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sin conexión.");
    expect(screen.getByRole("banner").nextElementSibling).toBe(banner);
    vi.restoreAllMocks();
  });

  it("says nothing about the connection outside the editor, where nothing is saved", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(
      <AppShell scope="app">
        <main>Contenido</main>
      </AppShell>,
    );

    expect(screen.queryByText("Sin conexión.")).not.toBeInTheDocument();
    vi.restoreAllMocks();
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

  it("always offers Inicio and Proyectos, then the sections the page adds", () => {
    renderWithIntl(
      <AppShell scope="app" current="home" sections={<li>Organización</li>}>
        <main />
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Inicio", "/home"],
      ["Proyectos", "/projects"],
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(within(nav).getByText("Organización")).toBeInTheDocument();
  });

  it("marks Proyectos, with lucide's folder, as the current page on the projects list", () => {
    renderWithIntl(
      <AppShell scope="app" current="projects">
        <main />
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    const projects = within(nav).getByRole("link", { name: "Proyectos" });
    expect(projects).toHaveAttribute("aria-current", "page");
    expect(projects.querySelector("svg")).toHaveClass("lucide-folder");
    expect(within(nav).getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("marks Proyectos as the section, not the page, inside a project and in the editor", () => {
    renderWithIntl(
      <AppShell scope="editor" current="inside-projects">
        <main />
      </AppShell>,
    );

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(within(nav).getByRole("link", { name: "Proyectos" })).toHaveAttribute(
      "aria-current",
      "true",
    );
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
