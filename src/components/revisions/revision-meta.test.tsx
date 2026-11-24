import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithIntl } from "@/test/render";

import { RevisionMeta } from "./revision-meta";

// docs/domain.md, "What a revision holds" and "Choosing a revision": when a revision was made, by
// whom and why. A revision the slice 6 backfill made has no author, and says it was migrated
// instead of naming a former member. Synthetic data only.

const madeAt = new Date("2026-10-28T12:00:00Z");

describe("RevisionMeta", () => {
  it("names the author and the reason", () => {
    renderWithIntl(
      <RevisionMeta
        revision={{ madeAt, author: "Ada Synthetic", reason: "chosen" }}
        anonymous="formerMember"
      />,
    );
    expect(screen.getByText(/Ada Synthetic/)).toBeInTheDocument();
    expect(screen.getByText(/elegida/)).toBeInTheDocument();
  });

  it("says a revision without an author was made by a former member", () => {
    renderWithIntl(
      <RevisionMeta
        revision={{ madeAt, author: null, reason: "saved" }}
        anonymous="formerMember"
      />,
    );
    expect(screen.getByText(/antiguo miembro/)).toBeInTheDocument();
  });

  it("says a migrated revision was migrated, naming nobody", () => {
    renderWithIntl(
      <RevisionMeta
        revision={{ madeAt, author: null, reason: "migrated" }}
        anonymous="formerMember"
      />,
    );
    expect(screen.getByText(/migrada/)).toBeInTheDocument();
    expect(screen.queryByText(/antiguo miembro/)).not.toBeInTheDocument();
  });
});
