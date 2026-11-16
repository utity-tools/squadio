// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  MAX_PROJECT_TEXT,
  newProjectErrors,
  newProjectSchema,
  projectFormValues,
} from "./new-project";

const fixed = { name: "Client portal", client: "Synthetic Bank", pricingModel: "fixed" };

describe("newProjectSchema", () => {
  it("keeps a fixed price project with its price in cents", () => {
    expect(newProjectSchema("es").parse({ ...fixed, price: "200.000,00 €" })).toEqual({
      name: "Client portal",
      client: "Synthetic Bank",
      pricingModel: "fixed",
      priceCents: 20000000,
      plannedPeriod: null,
      description: null,
    });
  });

  it("keeps the planned period and the description", () => {
    const project = newProjectSchema("es").parse({
      ...fixed,
      plannedStart: "2027-04-01",
      plannedEnd: "2027-09-30",
      description: " A portal for the bank's clients. ",
    });
    expect(project).toMatchObject({
      plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
      description: "A portal for the bank's clients.",
    });
  });

  it("says what is wrong with the planned period and the description", () => {
    const result = newProjectSchema("es").safeParse({
      ...fixed,
      plannedStart: "2027-04-01",
      plannedEnd: "2027-03-01",
      description: "x".repeat(501),
    });
    expect(newProjectErrors(result.error!)).toEqual({
      plannedEnd: "ends-before-start",
      description: "too-long",
    });
    const incomplete = newProjectSchema("es").safeParse({ ...fixed, plannedEnd: "2099-01-01" });
    expect(newProjectErrors(incomplete.error!)).toEqual({
      plannedStart: "incomplete",
      plannedEnd: "outside-calendar",
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

describe("projectFormValues", () => {
  it("opens an empty form for a new project", () => {
    expect(projectFormValues(null, "es")).toEqual({
      name: "",
      client: "",
      pricingModel: "fixed",
      price: "",
      plannedStart: "",
      plannedEnd: "",
      description: "",
    });
  });

  it("fills a project back in, its price typed in the page's locale", () => {
    const project = {
      name: "Client portal",
      client: "Synthetic Bank",
      pricingModel: "fixed" as const,
      priceCents: 2000050,
      plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
      description: "A portal.",
    };
    expect(projectFormValues(project, "es")).toEqual({
      name: "Client portal",
      client: "Synthetic Bank",
      pricingModel: "fixed",
      price: "20000,50",
      plannedStart: "2027-04-01",
      plannedEnd: "2027-09-30",
      description: "A portal.",
    });
    expect(projectFormValues({ ...project, priceCents: 150000 }, "en").price).toBe("1500");
  });

  it("parses back to the same project", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("es", "en"),
        fc.option(fc.integer({ min: 1, max: 10 ** 11 }), { nil: null }),
        (locale: "es" | "en", priceCents) => {
          const project = {
            name: "Client portal",
            client: "Synthetic Bank",
            pricingModel: "fixed" as const,
            priceCents,
            plannedPeriod: { start: "2027-04-01", end: "2027-09-30" },
            description: "A portal.",
          };
          expect(newProjectSchema(locale).parse(projectFormValues(project, locale))).toEqual(
            project,
          );
        },
      ),
    );
  });
});
