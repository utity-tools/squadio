// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { MAX_PROJECT_TEXT, newProjectErrors, newProjectSchema } from "./new-project";

const fixed = { name: "Client portal", client: "Synthetic Bank", pricingModel: "fixed" };

describe("newProjectSchema", () => {
  it("keeps a fixed price project with its price in cents", () => {
    expect(newProjectSchema("es").parse({ ...fixed, price: "200.000,00 €" })).toEqual({
      name: "Client portal",
      client: "Synthetic Bank",
      pricingModel: "fixed",
      priceCents: 20000000,
    });
  });

  it("reads the price in the form's locale", () => {
    expect(newProjectSchema("en").parse({ ...fixed, price: "1,500.50" }).priceCents).toBe(150050);
  });

  it("keeps a fixed price project without a price, whose revenue stays pending", () => {
    for (const price of ["", "  ", undefined, null]) {
      expect(newProjectSchema("es").parse({ ...fixed, price }).priceCents).toBeNull();
    }
  });

  it("drops a price sent with time and materials", () => {
    const project = newProjectSchema("es").parse({
      ...fixed,
      pricingModel: "time_and_materials",
      price: "1.000",
    });
    expect(project).toMatchObject({ pricingModel: "time_and_materials", priceCents: null });
  });

  it("trims the name and the client", () => {
    const project = newProjectSchema("es").parse({ ...fixed, name: " A ", client: "\tB\n" });
    expect(project).toMatchObject({ name: "A", client: "B" });
  });

  it("says which fields are wrong and why", () => {
    const result = newProjectSchema("es").safeParse({
      name: "   ",
      client: "a".repeat(MAX_PROJECT_TEXT + 1),
      pricingModel: "retainer",
      price: "",
    });
    expect(result.success).toBe(false);
    expect(newProjectErrors(result.error!)).toEqual({
      name: "blank",
      client: "too-long",
      pricingModel: "invalid",
    });
  });

  it.each([["0"], ["0,00"], ["-5"], ["abc"], ["1,005"]])("refuses the price %j", (price) => {
    const result = newProjectSchema("es").safeParse({ ...fixed, price });
    expect(newProjectErrors(result.error!)).toEqual({ price: "invalid" });
  });

  it("keeps texts at the limit", () => {
    const text = "a".repeat(MAX_PROJECT_TEXT);
    expect(newProjectSchema("es").safeParse({ ...fixed, name: text, client: text }).success).toBe(
      true,
    );
  });

  it("only ever returns a positive price for a fixed price project", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("fixed", "time_and_materials"),
        fc.string({ maxLength: 20 }),
        (pricingModel, price) => {
          const result = newProjectSchema("es").safeParse({ ...fixed, pricingModel, price });
          if (!result.success) return;
          const { priceCents } = result.data;
          if (pricingModel === "time_and_materials") expect(priceCents).toBeNull();
          else expect(priceCents === null || priceCents > 0).toBe(true);
        },
      ),
    );
  });
});
