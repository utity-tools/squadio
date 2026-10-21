import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { THEME_COOKIE, readThemePreference } from "./theme";
import { ThemeSwitch } from "./theme-switch";

afterEach(() => {
  document.cookie = `${THEME_COOKIE}=; path=/; max-age=0`;
});

describe("ThemeSwitch", () => {
  it("offers system, light and dark as one named radio group, system first", () => {
    renderWithIntl(<ThemeSwitch />);

    const group = screen.getByRole("radiogroup", { name: "Tema" });
    expect(group).toBeInTheDocument();
    expect(screen.getAllByRole("radio").map((radio) => radio.getAttribute("aria-label"))).toEqual([
      "Sistema",
      "Claro",
      "Oscuro",
    ]);
    expect(screen.getByRole("radio", { name: "Sistema" })).toBeChecked();
  });

  it("names each icon for sighted users too, in a tooltip", () => {
    renderWithIntl(<ThemeSwitch />, { locale: "en" });

    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("title", "Light");
  });

  it("shows the stored preference", () => {
    document.cookie = `${THEME_COOKIE}=dark; path=/`;

    renderWithIntl(<ThemeSwitch />, { locale: "en" });

    expect(screen.getByRole("radio", { name: "Dark" })).toBeChecked();
  });

  it("stores the chosen theme", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ThemeSwitch />);

    await user.click(screen.getByRole("radio", { name: "Oscuro" }));

    expect(readThemePreference(document.cookie)).toBe("dark");
    expect(screen.getByRole("radio", { name: "Oscuro" })).toBeChecked();
  });

  it("keeps a theme chosen when its option is clicked again", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ThemeSwitch />);

    await user.click(screen.getByRole("radio", { name: "Sistema" }));

    expect(screen.getByRole("radio", { name: "Sistema" })).toBeChecked();
  });

  it("is one tab stop, moved with the arrow keys and chosen with Space", async () => {
    const user = userEvent.setup();
    renderWithIntl(<ThemeSwitch />);

    await user.tab();
    expect(screen.getByRole("radio", { name: "Sistema" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: "Claro" })).toHaveFocus();
    await user.keyboard(" ");

    expect(readThemePreference(document.cookie)).toBe("light");
    await user.tab();
    expect(document.body).toHaveFocus();
  });
});
