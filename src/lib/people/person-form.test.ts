// @vitest-environment node
import { describe, expect, it } from "vitest";

import { personFormErrors, personFormSchema, personFormValues } from "./person-form";

const CATEGORY = "6d656d6f-0000-4000-8000-000000000010";

const form = {
  name: "  Pablo Ruiz ",
  categoryId: CATEGORY,
  weeklyHours: "37,5",
  area: "  Plataforma ",
  active: "on",
};

const errorsOf = (input: Record<string, unknown>) => {
  const result = personFormSchema.safeParse(input);
  if (result.success) throw new Error("Expected a validation error");
  return personFormErrors(result.error);
};

describe("personFormSchema", () => {
  it("reads a person with trimmed text and weekly hours typed with a comma", () => {
    expect(personFormSchema.parse(form)).toEqual({
      name: "Pablo Ruiz",
      categoryId: CATEGORY,
      weeklyHours: 37.5,
      area: "Plataforma",
      active: true,
    });
  });

  it("reads weekly hours typed with a point", () => {
    expect(personFormSchema.parse({ ...form, weeklyHours: "20.25" }).weeklyHours).toBe(20.25);
  });

  it("leaves the area empty when it is blank or missing", () => {
    expect(personFormSchema.parse({ ...form, area: "   " }).area).toBeNull();
    expect(personFormSchema.parse({ ...form, area: null }).area).toBeNull();
  });

  it("reads an unchecked box, which the form does not send, as inactive", () => {
    expect(personFormSchema.parse({ ...form, active: null }).active).toBe(false);
  });

  it("asks for a name, a category and weekly hours", () => {
    expect(errorsOf({ ...form, name: " ", categoryId: "", weeklyHours: "" })).toEqual({
      name: "blank",
      categoryId: "blank",
      weeklyHours: "blank",
    });
    expect(errorsOf({ area: "x" })).toEqual({
      name: "blank",
      categoryId: "blank",
      weeklyHours: "blank",
    });
  });

  it("refuses a name or an area longer than 100 characters", () => {
    expect(errorsOf({ ...form, name: "a".repeat(101), area: "b".repeat(101) })).toEqual({
      name: "too-long",
      area: "too-long",
    });
    expect(personFormSchema.parse({ ...form, name: "a".repeat(100) }).name).toHaveLength(100);
  });

  it("refuses a category that is not an id", () => {
    expect(errorsOf({ ...form, categoryId: "DevOps" })).toEqual({ categoryId: "invalid" });
  });

  it.each(["0", "-5", "169", "40,123", "cuarenta", "4 0"])(
    "refuses weekly hours of %s: above 0, up to a whole week, two decimals",
    (weeklyHours) => {
      expect(errorsOf({ ...form, weeklyHours })).toEqual({ weeklyHours: "invalid" });
    },
  );

  it("accepts a whole week", () => {
    expect(personFormSchema.parse({ ...form, weeklyHours: "168" }).weeklyHours).toBe(168);
  });
});

describe("personFormValues", () => {
  it("opens a new person active, with the organization's weekly hours and no category", () => {
    expect(personFormValues(null, 40, "es")).toEqual({
      name: "",
      categoryId: "",
      weeklyHours: "40",
      area: "",
      active: true,
    });
  });

  it("fills a person back in, hours in the page's locale", () => {
    const person = {
      id: "p",
      name: "Laura Gómez",
      categoryId: CATEGORY,
      weeklyHours: 37.5,
      area: null,
      active: false,
    };
    expect(personFormValues(person, 40, "es")).toEqual({
      name: "Laura Gómez",
      categoryId: CATEGORY,
      weeklyHours: "37,5",
      area: "",
      active: false,
    });
    expect(personFormValues(person, 40, "en").weeklyHours).toBe("37.5");
  });
});
