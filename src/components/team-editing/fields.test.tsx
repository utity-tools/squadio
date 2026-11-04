import { describe, expect, it } from "vitest";

import { controlClassName } from "@/components/ui/field";

import { FIELD, NUMBER_FIELD } from "./fields";

describe("the team dialogs' fields", () => {
  it("are the design system's control, numbers right-aligned in mono", () => {
    expect(FIELD).toBe(controlClassName());
    expect(NUMBER_FIELD).toBe(controlClassName({ numeric: true }));
  });
});
