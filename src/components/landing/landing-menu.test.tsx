import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { LandingMenu } from "./landing-menu";

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

// Below md the landing's sections, language and actions move to a ☰ menu (board "MobileLanding",
// «Menú abierto»): a full-screen panel with big links, the language and the two actions at the end.

const GUIDE = "/scenarios/6d656d6f-0000-4000-8000-000000000200";
let medias: { matches: boolean; listeners: Set<() => void> }[] = [];

beforeEach(() => {
  medias = [];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => {
      const media = { matches: false, listeners: new Set<() => void>() };
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
});

async function openMenu() {
  renderWithIntl(<LandingMenu />);
  const button = screen.getByRole("button", { name: "Abrir el menú" });
  await userEvent.click(button);
  return { button, menu: within(screen.getByRole("dialog", { name: "Menú" })) };
}

describe("LandingMenu", () => {
  it("is a button shown only below md", () => {
    renderWithIntl(<LandingMenu />);

    expect(screen.getByRole("button", { name: "Abrir el menú" })).toHaveClass("md:hidden");
  });

  it("opens on the sections, in the header's order", async () => {
    const { menu } = await openMenu();

    const links = within(menu.getByRole("navigation", { name: "Principal" })).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Producto", "#producto"],
      ["Cómo funciona", "#como"],
      ["Principios", "#principios"],
      ["Hoja de ruta", "#hoja"],
    ]);
  });

  it("offers the languages as links, the current one marked", async () => {
    const { menu } = await openMenu();

    const languages = within(menu.getByRole("navigation", { name: "Idioma" }));
    expect(languages.getByRole("link", { name: /^es ?· Español$/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const english = languages.getByRole("link", { name: /^en ?· English$/ });
    expect(english).toHaveAttribute("href", "/en");
    expect(english).not.toHaveAttribute("aria-current");
  });

  it("ends with the demo and «Entrar»", async () => {
    const { menu } = await openMenu();

    expect(menu.getByRole("link", { name: "Probar la demo, sin cuenta" })).toHaveAttribute(
      "href",
      GUIDE,
    );
    expect(menu.getByRole("link", { name: "Entrar" })).toHaveAttribute("href", "/sign-in");
  });

  it("closes with Escape, back to its button", async () => {
    const { button } = await openMenu();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(button).toHaveFocus();
  });

  it("closes once a section is followed", async () => {
    const { menu } = await openMenu();

    await userEvent.click(menu.getByRole("link", { name: "Hoja de ruta" }));

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("closes when the window grows to md, where the header shows the sections", async () => {
    await openMenu();

    act(() => {
      for (const media of medias) {
        media.matches = true;
        for (const listener of media.listeners) listener();
      }
    });

    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
