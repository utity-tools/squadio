import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { ShellPlacement } from "@/components/shell/placement";

import { AccountStatusView } from "./account-status";

const replace = vi.fn();
const signOut = vi.fn();

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ replace }),
}));
vi.mock("./use-sign-out", () => ({
  useSignOut: () => ({ signOut, pending: false, failed: false }),
}));

// The account corner (design board 14, "Cuenta · a la derecha"): an avatar with the account's
// initials opens its name and email, the language and «Cerrar sesión»; signed out, an outline
// «Entrar». In the ☰ menu, 44 px rows.

const ada = { name: "Ada Synthetic", email: "ada@example.test" };

describe("AccountStatusView", () => {
  it("shows the account as an avatar that opens its name, email, language and sign-out", async () => {
    renderWithIntl(<AccountStatusView account={ada} signUp={false} />);

    const avatar = screen.getByRole("button", { name: "Cuenta: Ada Synthetic" });
    expect(avatar).toHaveTextContent("AS");
    await userEvent.click(avatar);

    expect(avatar).toHaveAttribute("title", "Cuenta: Ada Synthetic");
    const menu = screen.getByRole("menu");
    // The name and email are not items: the menu's description says them.
    expect(menu).toHaveAccessibleDescription(/Ada Synthetic.*ada@example\.test/);
    expect(within(menu).getByRole("group", { name: "Idioma" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitemradio", { name: "Español" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(menu).getByRole("menuitemradio", { name: "English" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await userEvent.click(within(menu).getByRole("menuitem", { name: "Cerrar sesión" }));
    expect(signOut).toHaveBeenCalled();
    expect(screen.queryByRole("link", { name: "Entrar" })).not.toBeInTheDocument();
  });

  it("changes the language on the same page, keeping its query", async () => {
    window.history.pushState({}, "", "/scenarios/abc?view=table#resumen");
    renderWithIntl(<AccountStatusView account={ada} signUp={false} />);

    await userEvent.click(screen.getByRole("button", { name: /Cuenta/ }));
    await userEvent.click(screen.getByRole("menuitemradio", { name: "English" }));

    expect(replace).toHaveBeenCalledWith("/scenarios/abc?view=table#resumen", { locale: "en" });
  });

  it("offers an outline «Entrar» while sign-up is open", () => {
    renderWithIntl(<AccountStatusView account={null} signUp />);

    const signIn = screen.getByRole("link", { name: "Entrar" });
    expect(signIn).toHaveAttribute("href", "/sign-in");
    expect(signIn).toHaveClass("border-input");
  });

  it("shows nothing to sign in with while sign-up is off (ADR 0012)", () => {
    const { container } = renderWithIntl(<AccountStatusView account={null} signUp={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  describe("in the phone and tablet menu", () => {
    it("says who is signed in, offers the language and «Salir» as a 44 px item", async () => {
      window.history.pushState({}, "", "/organization");
      renderWithIntl(
        <ShellPlacement value="menu">
          <AccountStatusView account={ada} signUp={false} />
        </ShellPlacement>,
      );

      expect(screen.getByText("Ada Synthetic")).toBeInTheDocument();
      expect(screen.getByText("ada@example.test")).toBeInTheDocument();
      const language = screen.getByRole("radiogroup", { name: "Idioma" });
      expect(language.parentElement).toHaveClass("[&_[role=radio]]:h-11");
      const spanish = within(language).getByRole("radio", { name: "Español" });
      expect(spanish).toBeChecked();
      expect(spanish).toHaveAttribute("lang", "es");
      await userEvent.click(within(language).getByRole("radio", { name: "English" }));
      expect(replace).toHaveBeenCalledWith("/organization", { locale: "en" });
      expect(screen.getByRole("button", { name: "Salir" })).toHaveClass("min-h-11");
      expect(screen.queryByRole("link", { name: "Tu organización" })).not.toBeInTheDocument();
    });

    it("offers «Entrar» as a 44 px item while sign-up is open", () => {
      renderWithIntl(
        <ShellPlacement value="menu">
          <AccountStatusView account={null} signUp />
        </ShellPlacement>,
      );

      const signIn = screen.getByRole("link", { name: "Entrar" });
      expect(signIn).toHaveAttribute("href", "/sign-in");
      expect(signIn).toHaveClass("min-h-11");
    });
  });
});
