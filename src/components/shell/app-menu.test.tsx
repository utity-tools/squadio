import { screen, within } from "@testing-library/react";
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

    await userEvent.click(open);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(open).toHaveFocus();
  });
});
