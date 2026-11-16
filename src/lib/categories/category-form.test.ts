// @vitest-environment node
import { describe, expect, it } from "vitest";

import { categoryFormErrors, categoryFormSchema, categoryFormValues } from "./category-form";

const form = {
  name: "  DevOps Engineer ",
  salaryPeriod: "year",
  salary: "50.000",
  payments: "14",
  socialSecurity: "31",
  otherCosts: "3.000",
  manualCostPerHour: "",
  sellRate: "62",
};

const parse = (input: Record<string, unknown>, locale: "es" | "en" = "es") =>
  categoryFormSchema(locale).safeParse(input);

const errorsOf = (input: Record<string, unknown>) => {
  const result = parse(input);
  if (result.success) throw new Error("Expected a validation error");
  return categoryFormErrors(result.error);
};

describe("categoryFormSchema", () => {
  it("reads a category with a yearly salary into cents and basis points", () => {
    expect(parse(form).data).toEqual({
      name: "DevOps Engineer",
      rate: {
        grossAnnualSalaryCents: 5_000_000,
        socialSecurityBasisPoints: 3100,
        otherYearlyCostsCents: 300_000,
        manualCostPerHourCents: null,
        sellRateCents: 6200,
      },
    });
  });

  it("stores a monthly salary as the year's: monthly × number of payments", () => {
    const result = parse({ ...form, salaryPeriod: "month", salary: "2.100", payments: "14" });
    expect(result.data?.rate.grossAnnualSalaryCents).toBe(2_940_000);
  });

  it("reads 12 payments too, and ignores payments with a yearly salary", () => {
    expect(
      parse({ ...form, salaryPeriod: "month", salary: "2.100", payments: "12" }).data?.rate
        .grossAnnualSalaryCents,
    ).toBe(2_520_000);
    expect(parse({ ...form, payments: "7" }).success).toBe(true);
  });

  it("reads amounts and percentages in the page's locale", () => {
    const result = parse(
      {
        ...form,
        salary: "50,000.50",
        otherCosts: "3,000",
        socialSecurity: "31.17%",
        sellRate: "€62.5",
      },
      "en",
    );
    expect(result.data?.rate).toMatchObject({
      grossAnnualSalaryCents: 5_000_050,
      socialSecurityBasisPoints: 3117,
      sellRateCents: 6250,
    });
  });

  it("keeps a manual cost per hour when one is typed", () => {
    expect(parse({ ...form, manualCostPerHour: "44,19" }).data?.rate.manualCostPerHourCents).toBe(
      4419,
    );
  });

  it("names the first problem of each field", () => {
    expect(
      errorsOf({
        name: " ",
        salaryPeriod: "week",
        salary: "mucho",
        payments: "14",
        socialSecurity: "1.000",
        otherCosts: "",
        manualCostPerHour: "-1",
        sellRate: "",
      }),
    ).toEqual({
      name: "blank",
      salaryPeriod: "invalid",
      salary: "invalid",
      socialSecurity: "invalid",
      otherCosts: "blank",
      manualCostPerHour: "invalid",
      sellRate: "blank",
    });
  });

  it("refuses a name longer than 100 characters and payments other than 12 or 14", () => {
    expect(
      errorsOf({ ...form, name: "x".repeat(101), salaryPeriod: "month", payments: "13" }),
    ).toEqual({ name: "too-long", payments: "invalid" });
  });

  it("refuses a monthly salary whose year does not fit numeric(12,2)", () => {
    expect(
      errorsOf({ ...form, salaryPeriod: "month", salary: "9.999.999.999", payments: "14" }),
    ).toEqual({ salary: "invalid" });
  });
});

describe("categoryFormValues", () => {
  it("starts a new category with the Consultancy template's social security and other costs", () => {
    expect(categoryFormValues(null, "es")).toEqual({
      name: "",
      salary: "",
      socialSecurity: "31",
      otherCosts: "3000",
      manualCostPerHour: "",
      sellRate: "",
    });
  });

  it("writes a rate back as the form reads it, in the page's locale", () => {
    const rate = {
      grossAnnualSalaryCents: 4_133_333,
      socialSecurityBasisPoints: 3117,
      otherYearlyCostsCents: 300_000,
      manualCostPerHourCents: 4419,
      sellRateCents: 6205,
    };
    const values = categoryFormValues({ name: "Senior Developer", rate }, "es");
    expect(values).toEqual({
      name: "Senior Developer",
      salary: "41333,33",
      socialSecurity: "31,17",
      otherCosts: "3000",
      manualCostPerHour: "44,19",
      sellRate: "62,05",
    });
    expect(categoryFormValues({ name: "x", rate }, "en").socialSecurity).toBe("31.17");
    const read = categoryFormSchema("es").parse({ ...values, salaryPeriod: "year" });
    expect(read.rate).toEqual(rate);
  });
});
