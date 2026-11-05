import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "@/test/axe";

import { EmptyArt, EmptyState } from "./empty-state";

// The redesign's empty state (board «Estados vacíos»): the logo's squares, never people, a title
// that says what is going on, one sentence on what to do next, and the action, if there is one.

describe("EmptyState", () => {
  it("names the state in a heading and says what to do next", () => {
    render(
      <EmptyState
        art={<EmptyArt variant="search" />}
        title="Nobody matches"
        description="Try another name."
      />,
    );

    expect(screen.getByRole("heading", { level: 2, name: "Nobody matches" })).toBeInTheDocument();
    expect(screen.getByText("Try another name.")).toBeInTheDocument();
  });

  it("takes the heading level and id its place needs", () => {
    render(
      <EmptyState art={<EmptyArt variant="outline" />} title="None yet" level={3} titleId="t" />,
    );

    expect(screen.getByRole("heading", { level: 3, name: "None yet" })).toHaveAttribute("id", "t");
  });

  it("shows its actions", () => {
    render(
      <EmptyState
        art={<EmptyArt variant="add" />}
        title="No team"
        actions={<button type="button">Add</button>}
      />,
    );

    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });

  it("keeps the art out of the accessibility tree: the words are enough", async () => {
    const { container } = render(
      <EmptyState art={<EmptyArt variant="search" />} title="Nobody matches" />,
    );

    expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("img")).toBeNull();
    await expectNoAxeViolations();
  });

  it.each(["add", "search", "outline", "missing"] as const)("draws the %s art", (variant) => {
    const { container } = render(<EmptyArt variant={variant} />);

    expect(container.querySelector(`[data-art="${variant}"]`)).toBeInTheDocument();
  });
});
