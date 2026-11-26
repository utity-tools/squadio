import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { AppSidebar, SidebarLink } from "./app-sidebar";
import { sidebarCookieName, writeSidebarState } from "./sidebar-state";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// The sidebar of the design board "Navegación de la app": only the sections that exist, the
// current one on --selected at weight 600, and a button that folds it to a 56 px icon rail where a
// tooltip names each icon. The choice is the place's (sidebar-state.ts).

function renderSidebar(scope: "app" | "editor", current?: "home" | "organization") {
  return renderWithIntl(
    <AppSidebar scope={scope}>
      <SidebarLink href="/" icon="home" label="Inicio" current={current === "home"} />
      <SidebarLink
        href="/organization"
        icon="organization"
        label="Organización"
        current={current === "organization"}
      />
    </AppSidebar>,
  );
}

beforeEach(() => {
  // Radix measures the tooltip it places.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  delete document.documentElement.dataset.sidebarApp;
  delete document.documentElement.dataset.sidebarEditor;
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const scope of ["app", "editor"] as const) {
    document.cookie = `${sidebarCookieName(scope)}=; path=/; max-age=0`;
  }
});

describe("AppSidebar", () => {
  it("lists the sections in a navigation landmark and marks the current page", () => {
    renderSidebar("app", "organization");

    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(nav).toBeInTheDocument();
    const current = screen.getByRole("link", { name: "Organización" });
    expect(current).toHaveAttribute("aria-current", "page");
    expect(current).toHaveClass("[&[aria-current]]:bg-selected", "[&[aria-current]]:font-semibold");
    expect(screen.getByRole("link", { name: "Inicio" })).not.toHaveAttribute("aria-current");
  });

  it("starts open on the app's pages and folds with its button, remembering the choice", async () => {
    renderSidebar("app");

    const toggle = screen.getByRole("button", { name: "Plegar la barra lateral" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", screen.getByRole("navigation").id);

    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName("Desplegar la barra lateral");
    expect(document.documentElement.dataset.sidebarApp).toBe("collapsed");
    expect(document.cookie).toContain(`${sidebarCookieName("app")}=collapsed`);
  });

  it("starts folded in the editor and follows a change made elsewhere on the page", () => {
    renderSidebar("editor");

    const toggle = screen.getByRole("button", { name: "Desplegar la barra lateral" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    act(() => writeSidebarState("editor", "expanded"));

    expect(toggle).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps each link's name when folded and shows it in a tooltip on focus", async () => {
    renderSidebar("editor");

    await userEvent.tab();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveFocus();
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Inicio");
  });

  it("is the page's banner from lg, sticky at the window's height, with a top and a foot", () => {
    renderWithIntl(
      <AppSidebar scope="app" top={<button type="button">Logo</button>} bottom={<span>Tema</span>}>
        <SidebarLink href="/" icon="home" label="Inicio" />
      </AppSidebar>,
    );

    const banner = screen.getByRole("banner");
    expect(banner).toHaveClass("max-lg:hidden", "lg:sticky", "lg:top-0", "lg:h-dvh");
    const nav = screen.getByRole("navigation", { name: "Secciones" });
    expect(banner).toContainElement(nav);
    expect(screen.getByRole("button", { name: "Logo" }).compareDocumentPosition(nav)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(nav.compareDocumentPosition(screen.getByText("Tema"))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // The fold button stays last.
    expect(
      screen
        .getByText("Tema")
        .compareDocumentPosition(screen.getByRole("button", { name: "Plegar la barra lateral" })),
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("shows no tooltip while open: the label is on screen", async () => {
    renderSidebar("app");

    await userEvent.tab();

    expect(screen.getByRole("link", { name: "Inicio" })).toHaveFocus();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });
});
