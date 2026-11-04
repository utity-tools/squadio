import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { expectNoAxeViolations } from "./axe";

// The helper must fail on a real violation, or every test that uses it would pass for nothing.

describe("expectNoAxeViolations", () => {
  it("passes a named button", async () => {
    render(<button type="button">Guardar</button>);

    await expectNoAxeViolations();
  });

  it("fails a button with no name", async () => {
    render(<button type="button" />);

    await expect(expectNoAxeViolations()).rejects.toThrow(/button-name/);
  });
});
