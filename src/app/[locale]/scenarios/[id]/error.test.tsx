import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { stubScreen } from "@/test/navigation";
import { renderWithIntl } from "@/test/render";

import ScenarioError from "./error";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

beforeEach(() => {
  stubScreen({ wide: true });
});

describe("ScenarioError", () => {
  it("says the scenario could not be opened, without the error's details", () => {
    renderWithIntl(<ScenarioError error={new Error("secret detail")} retry={() => {}} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No hemos podido abrir este escenario" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
  });

  it("keeps the app's frame, to go on from", () => {
    renderWithIntl(<ScenarioError error={new Error("down")} retry={() => {}} />);

    expect(screen.getByRole("banner")).toContainElement(
      screen.getByRole("link", { name: "Squadio, Inicio" }),
    );
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("tries again on request", async () => {
    const retry = vi.fn();
    renderWithIntl(<ScenarioError error={new Error("down")} retry={retry} />, { locale: "en" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });
});
