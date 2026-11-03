import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { renderWithIntl } from "@/test/render";

import { OrganizationOverview } from "./organization-overview";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const projects = [
  {
    id: "0b5e0c1e-0000-4000-8000-000000000100",
    name: "Portal",
    client: "Synthetic Client",
    scenarios: [
      { id: "0b5e0c1e-0000-4000-8000-000000000200", name: "Plan A", chosen: true },
      { id: "0b5e0c1e-0000-4000-8000-000000000201", name: "Plan B", chosen: false },
    ],
  },
  { id: "0b5e0c1e-0000-4000-8000-000000000101", name: "Upkeep", client: "Other", scenarios: [] },
];

describe("OrganizationOverview", () => {
  it("names the organization and links each project's scenarios, saying which is chosen", () => {
    renderWithIntl(
      <OrganizationOverview name="Synthetic Consulting" example={false} projects={projects} />,
    );

    expect(
      screen.getByRole("heading", { level: 1, name: "Synthetic Consulting" }),
    ).toBeInTheDocument();
    const list = screen.getByRole("region", { name: "Proyectos" });
    expect(within(list).getByText("Portal · Synthetic Client")).toBeInTheDocument();
    expect(within(list).getByRole("link", { name: "Plan A" })).toHaveAttribute(
      "href",
      "/scenarios/0b5e0c1e-0000-4000-8000-000000000200",
    );
    expect(within(list).getByText(/elegido/)).toBeInTheDocument();
    expect(within(list).getByText("Todavía no hay escenarios.")).toBeInTheDocument();
  });

  it("says when the organization holds the demo's example, and only then", () => {
    const { unmount } = renderWithIntl(
      <OrganizationOverview name="Ejemplo de Squadio" example projects={projects} />,
    );
    expect(screen.getByText(/contiene el ejemplo sintético de la demo/)).toBeInTheDocument();

    unmount();
    renderWithIntl(
      <OrganizationOverview name="Synthetic Consulting" example={false} projects={[]} />,
    );
    expect(screen.queryByText(/ejemplo sintético/)).not.toBeInTheDocument();
    expect(screen.getByText("Esta organización todavía no tiene proyectos.")).toBeInTheDocument();
  });
});
