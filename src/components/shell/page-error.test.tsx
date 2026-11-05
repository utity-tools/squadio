import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";
import { renderWithIntl } from "@/test/render";

import { PageError } from "./page-error";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// What a page shows when it cannot be read (the database is down, a stored row is invalid):
// never Next.js's own English page, never the details, a retry and, where there is one, a way
// out (board «Errores», 3).

const serverError = (digest: string) => Object.assign(new Error("secret detail"), { digest });

describe("PageError", () => {
  it("says the page could not be opened, without the error's details", () => {
    renderWithIntl(<PageError error={new Error("secret detail")} retry={() => {}} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No hemos podido abrir esta página" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("main")).toHaveTextContent(
      "Algo ha fallado al leerla. Prueba otra vez dentro de un momento.",
    );
    expect(screen.queryByText(/secret detail/)).not.toBeInTheDocument();
  });

  it("names a scenario when it is one that failed", () => {
    renderWithIntl(<PageError of="scenario" error={new Error("down")} retry={() => {}} />);

    expect(
      screen.getByRole("heading", { level: 1, name: "No hemos podido abrir este escenario" }),
    ).toBeInTheDocument();
  });

  it("tries again on request", async () => {
    const retry = vi.fn();
    renderWithIntl(<PageError error={new Error("down")} retry={retry} />, { locale: "en" });

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledOnce();
  });

  it("offers a way out when it has one", () => {
    const { unmount } = renderWithIntl(
      <PageError error={new Error("down")} retry={() => {}} exit="home" />,
    );
    expect(screen.getByRole("link", { name: "Ir a Inicio" })).toHaveAttribute("href", "/home");
    unmount();

    renderWithIntl(<PageError error={new Error("down")} retry={() => {}} exit="start" />);
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toHaveAttribute("href", "/");
  });

  it("shows the server's reference, to quote it, and copies it", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderWithIntl(<PageError error={serverError("7f3a21c0")} retry={() => {}} />);

    expect(screen.getByRole("main")).toHaveTextContent("Referencia 7f3a21c0");
    await user.click(screen.getByRole("button", { name: "Copiar la referencia" }));

    expect(writeText).toHaveBeenCalledWith("7f3a21c0");
    expect(await screen.findByRole("status")).toHaveTextContent("Referencia copiada");
  });

  it("shows no reference for an error without one", () => {
    renderWithIntl(<PageError error={new Error("down")} retry={() => {}} />);

    expect(screen.queryByText(/Referencia/)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Copiar/ })).toBeNull();
  });

  it("has no accessibility violations", async () => {
    renderWithIntl(<PageError error={serverError("7f3a21c0")} retry={() => {}} exit="home" />);

    await expectNoAxeViolations();
  });
});
