import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { SignOutButton } from "./sign-out-button";

const signOut = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("@/auth/client", () => ({ authClient: { signOut } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

beforeEach(() => {
  signOut.mockReset();
  refresh.mockReset();
});

describe("SignOutButton", () => {
  it("signs out, then renders the page again without the account", async () => {
    signOut.mockResolvedValue({ data: { success: true }, error: null });
    renderWithIntl(<SignOutButton />, { locale: "en" });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("keeps the focus while it signs out, and signs out once", async () => {
    signOut.mockReturnValue(new Promise(() => {}));
    renderWithIntl(<SignOutButton />, { locale: "en" });
    const button = screen.getByRole("button", { name: "Sign out" });

    await userEvent.click(button);
    await userEvent.click(button);

    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveFocus();
    expect(signOut).toHaveBeenCalledOnce();
  });

  it.each([
    ["the server refuses", () => signOut.mockResolvedValue({ data: null, error: { status: 500 } })],
    ["the request never reaches the server", () => signOut.mockRejectedValue(new TypeError("x"))],
  ])("says so and stays signed in when %s", async (_, fail) => {
    fail();
    renderWithIntl(<SignOutButton />);

    await userEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "No se ha podido cerrar la sesión. Vuelve a intentarlo.",
    );
    expect(refresh).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Cerrar sesión" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });
});
