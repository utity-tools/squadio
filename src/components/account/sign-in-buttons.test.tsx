import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SignInButtons } from "./sign-in-buttons";

const social = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { signIn: { social } } }));

beforeEach(() => {
  social.mockReset();
});

const paths = { callbackPath: "/en", errorPath: "/en/sign-in" };

describe("SignInButtons", () => {
  it("offers GitHub and Google", () => {
    renderWithIntl(<SignInButtons {...paths} />);

    expect(screen.getByRole("button", { name: "Continuar con GitHub" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toBeEnabled();
  });

  it.each([
    ["GitHub", "github"],
    ["Google", "google"],
  ])("starts %s's sign-in, back to the page's locale either way", async (name, provider) => {
    social.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignInButtons {...paths} />, { locale: "en" });

    await userEvent.click(screen.getByRole("button", { name: `Continue with ${name}` }));

    expect(social).toHaveBeenCalledWith({
      provider,
      callbackURL: "/en",
      errorCallbackURL: "/en/sign-in",
    });
  });

  it("marks both buttons unavailable while the provider's page loads, keeping the focus", async () => {
    social.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignInButtons {...paths} />);
    const github = screen.getByRole("button", { name: "Continuar con GitHub" });

    await userEvent.click(github);
    await userEvent.click(github);

    expect(github).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    expect(github).toHaveFocus();
    expect(social).toHaveBeenCalledOnce();
  });

  it("says so and lets the person try again when the sign-in cannot start", async () => {
    social.mockResolvedValue({ data: null, error: { status: 500, message: "synthetic" } });
    renderWithIntl(<SignInButtons {...paths} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar con Google" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido entrar. Vuelve a intentarlo.",
    );
    expect(screen.getByRole("button", { name: "Continuar con Google" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("says so too when the request never reaches the server", async () => {
    social.mockRejectedValue(new TypeError("Failed to fetch"));
    renderWithIntl(<SignInButtons {...paths} />);

    await userEvent.click(screen.getByRole("button", { name: "Continuar con GitHub" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("No se ha podido entrar.");
    expect(screen.getByRole("button", { name: "Continuar con GitHub" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });
});
