import { act, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SidebarLink } from "./app-sidebar";
import { AppMenu } from "./app-menu";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

// Below lg there is no sidebar (design boards 28–30): a ☰ button at the end of the top bar opens
// a side panel with the logo, the sections, the theme and the account, in 44 px items.

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

function renderMenu() {
  return renderWithIntl(
    <AppMenu
      sections={
        <>
          <SidebarLink href="/" icon="home" label="Inicio" current />
          <SidebarLink href="/organization" icon="organization" label="Organización" />
        </>
      }
      account={<button type="button">Salir</button>}
    />,
  );
}

describe("AppMenu", () => {
  it("is a 44 px button shown only below lg", () => {
    renderMenu();

    const open = screen.getByRole("button", { name: "Abrir el menú" });
    expect(open).toHaveClass("size-11", "lg:hidden");
    expect(open).toHaveAttribute("aria-haspopup", "dialog");
  });

  it("opens a panel with the sections in 44 px items, the theme and the account", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));

    const panel = screen.getByRole("dialog", { name: "Menú" });
    const nav = within(panel).getByRole("navigation", { name: "Secciones" });
    const home = within(nav).getByRole("link", { name: "Inicio" });
    expect(home).toHaveAttribute("aria-current", "page");
    expect(home).toHaveClass("min-h-11");
    expect(within(nav).getByRole("link", { name: "Organización" })).toHaveClass("min-h-11");
    expect(within(panel).getByRole("radiogroup", { name: "Tema" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Salir" })).toBeInTheDocument();
    // No tooltips here: every label is on screen.
    await userEvent.hover(home);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
  });

  it("closes once a section is followed, and with Escape back to its button", async () => {
    renderMenu();
    const open = screen.getByRole("button", { name: "Abrir el menú" });

    await userEvent.click(open);
    await userEvent.click(screen.getByRole("link", { name: "Organización" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    // Opened in a new tab, the link leaves the page where it is, and the panel open.
    await userEvent.click(open);
    fireEvent.click(screen.getByRole("link", { name: "Organización" }), { metaKey: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });

  it("closes when the window grows to lg, where the sidebar is back", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    const lg = medias.find((media) => media.query === "(min-width: 64rem)");
    expect(lg).toBeDefined();
    act(() => {
      lg!.matches = true;
      lg!.listeners.forEach((listener) => listener());
    });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("gives the theme's options 44 px too", async () => {
    renderMenu();
    await userEvent.click(screen.getByRole("button", { name: "Abrir el menú" }));

    expect(screen.getByRole("radiogroup", { name: "Tema" }).parentElement).toHaveClass(
      "[&_[role=radio]]:h-11",
    );
  });
});
