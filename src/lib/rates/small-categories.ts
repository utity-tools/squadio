import { z } from "zod";

// Rule j of docs/domain.md, "Small categories": a category's rate is an average only when enough
// people share it. The count is organization-wide, so this lives apart from calculateScenario.

const id = z.string().min(1);

const peopleSchema = z
  .array(z.object({ id, categoryId: id, active: z.boolean() }))
  .refine((list) => new Set(list.map((person) => person.id)).size === list.length, {
    message: "Person ids repeat",
  });

/**
 * A person of the organization as rule j counts them. Open roles are assignments without a
 * person, so they never reach this list.
 */
export type HeadcountPerson = z.infer<typeof peopleSchema>[number];

/** A category whose rate reveals a salary: 1 or 2 active people share it. */
export type SmallCategory = { categoryId: string; activePeople: 1 | 2 };

/**
 * The categories with 1 or 2 active people among the organization's `people`, sorted by category
 * id. Inactive people draw no salary, so they do not count; a category with none is not small.
 * Throws a `ZodError` on invalid input.
 */
export function findSmallCategories(people: readonly HeadcountPerson[]): SmallCategory[] {
  const active = new Map<string, number>();
  for (const person of peopleSchema.parse(people)) {
    if (person.active) active.set(person.categoryId, (active.get(person.categoryId) ?? 0) + 1);
  }

  const small: SmallCategory[] = [];
  for (const [categoryId, activePeople] of active) {
    if (activePeople === 1 || activePeople === 2) small.push({ categoryId, activePeople });
  }
  // Code-unit order, the same in every locale. Map keys are unique, so no two ids are equal.
  return small.toSorted((a, b) => (a.categoryId < b.categoryId ? -1 : 1));
}
