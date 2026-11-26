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

// One frame (ADR 0017). From lg there is no top bar: the sidebar is the page's banner, with the
// logo on top and the organization, the theme and the account at its foot, and the trail sits
// above the page when it has two crumbs or more. Below lg the 56 px top bar holds the logo, the
// organization, the trail and the ☰ menu, which holds the rest (boards 28–30).
// jsdom applies no media queries, so both banners are in the document: each test looks in one.

const topBar = () => screen.getAllByRole("banner")[0] as HTMLElement;
const sidebar = () =>
  screen.getByRole("navigation", { name: "Secciones" }).closest("header") as HTMLElement;

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
  it("keeps a 56 px top bar only below lg, with the logo, the organization and the trail", () => {
    renderWithIntl(
      <AppShell
        scope="app"
        organization={<span>Consultora Norte</span>}
        crumbs={<nav aria-label="Ruta de navegación">Plan A</nav>}
        account={<button type="button">Entrar</button>}
      >
        <main>Contenido</main>
      </AppShell>,
    );

    const bar = topBar();
    expect(bar).toHaveClass("min-h-14", "lg:hidden");
    expect(within(bar).getByRole("link", { name: "Squadio, Inicio" })).toHaveAttribute(
      "href",
      "/home",
    );
    expect(within(bar).getByText("Consultora Norte")).toBeInTheDocument();
    expect(within(bar).getByRole("navigation", { name: "Ruta de navegación" })).toBeInTheDocument();
    // Below lg the theme and the account are in the ☰ menu, not on the bar.
    expect(within(bar).queryByRole("radiogroup", { name: "Tema" })).not.toBeInTheDocument();
    expect(within(bar).queryByRole("button", { name: "Entrar" })).not.toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent("Contenido");
  });

  it("makes the sidebar the banner from lg: the logo on top, the rest at its foot", () => {
    renderWithIntl(
      <AppShell
        scope="app"
        organization={<span>Consultora Norte</span>}
        account={<button type="button">Entrar</button>}
      >
        <main />
      </AppShell>,
    );

    const side = sidebar();
    expect(side).toHaveClass("max-lg:hidden", "lg:sticky");
    const logo = within(side).getByRole("link", { name: "Squadio, Inicio" });
    expect(logo).toHaveAttribute("href", "/home");
    const theme = within(side).getByRole("radiogroup", { name: "Tema" });
    const account = within(side).getByRole("button", { name: "Entrar" });
    const organization = within(side).getByText("Consultora Norte");
    // Logo, sections, then organization, theme and account, in that order.
    const sections = within(side).getByRole("navigation", { name: "Secciones" });
    const order = [logo, sections, organization, theme, account];
    for (const [index, element] of order.slice(1).entries()) {
      expect(order[index]!.compareDocumentPosition(element)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
    // The organization's name has no room in the folded 56 px rail, and the switch stacks there.
    expect(organization.parentElement).toHaveClass("sidebar-folded:hidden");
    expect(theme).toHaveClass("sidebar-folded:flex-col");
  });

  it.each(["app", "editor"] as const)(
    "shows the %s page's trail above it from lg, when the trail has two crumbs or more",
    (scope) => {
      renderWithIntl(
        <AppShell scope={scope} crumbs={<nav aria-label="Ruta de navegación">Plan A</nav>}>
          <main>Contenido</main>
        </AppShell>,
      );

      const trails = screen.getAllByRole("navigation", { name: "Ruta de navegación" });
      expect(trails).toHaveLength(2);
      const above = trails[1]!.parentElement;
      expect(above).not.toBe(topBar());
      expect(topBar()).not.toContainElement(above);
      expect(above).toHaveClass("max-lg:hidden", "[&:not(:has(li+li))]:hidden");
      expect(
        above!.compareDocumentPosition(screen.getByRole("main")) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("says in the editor, atop the page beside the sidebar, when the connection is down", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithIntl(
      <AppShell scope="editor">
        <main>Contenido</main>
      </AppShell>,
    );

    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Sin conexión.");
    // In the page's column, so the sidebar keeps the window's height whatever the band takes.
    expect(sidebar()).not.toContainElement(banner);
    expect(banner.parentElement?.firstElementChild).toBe(banner);
    expect(banner.parentElement).toContainElement(screen.getByRole("main"));
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

  it("hides the sidebar below lg, where the ☰ menu holds the sections, theme and account", () => {
    renderWithIntl(
      <AppShell scope="app" account={<button type="button">Entrar</button>}>
        <main />
      </AppShell>,
    );

    expect(within(topBar()).getByRole("button", { name: "Abrir el menú" })).toHaveClass(
      "lg:hidden",
    );
    expect(sidebar()).toHaveClass("max-lg:hidden");
  });

  it("always offers Inicio, Proyectos and Personas, then the sections the page adds", () => {
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
      ["Personas", "/people"],
    ]);
    expect(links[0]).toHaveAttribute("aria-current", "page");
    expect(links[1]).not.toHaveAttribute("aria-current");
    expect(links[2]).not.toHaveAttribute("aria-current");
    expect(within(nav).getByText("Organización")).toBeInTheDocument();
  });

  it("marks Personas as the current page on the people list", () => {
    renderWithIntl(
      <AppShell scope="app" current="people">
        <main />
      </AppShell>,
    );
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(within(nav).getByRole("link", { name: "Personas" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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
