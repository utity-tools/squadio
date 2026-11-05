// docs/domain.md, "Occupancy by category": how busy each category is today, from its active people's
// occupancy (docs/domain.md, "How busy a person is"), weighted by their weekly hours. No money.

export type OccupancyPerson = {
  id: string;
  categoryId: string;
  /** Up to two decimals. */
  weeklyHours: number;
  active: boolean;
};

export type CategoryOccupancy = {
  category: { id: string; name: string };
  /** A whole percentage that may exceed 100. */
  percent: number;
};

/**
 * Each category's occupancy today, in the order of `categories`, leaving out those without active
 * people. `busy` holds each person's occupancy, as `occupancy` gives it; a person absent from it is
 * at 0%. Hours are counted in hundredths, so the weighted mean is exact before its one rounding.
 */
export function categoryOccupancy(
  categories: readonly { id: string; name: string }[],
  people: readonly OccupancyPerson[],
  busy: ReadonlyMap<string, number>,
): CategoryOccupancy[] {
  const totals = new Map<string, { booked: number; hours: number }>();
  for (const person of people) {
    if (!person.active) continue;
    const hours = Math.round(person.weeklyHours * 100);
    const total = totals.get(person.categoryId) ?? { booked: 0, hours: 0 };
    total.booked += (busy.get(person.id) ?? 0) * hours;
    total.hours += hours;
    totals.set(person.categoryId, total);
  }
  return categories.flatMap((category) => {
    const total = totals.get(category.id);
    if (!total || total.hours === 0) return [];
    // Half up, in integers: floor((2b + h) / 2h).
    const percent = Math.floor((2 * total.booked + total.hours) / (2 * total.hours));
    return [{ category: { id: category.id, name: category.name }, percent }];
  });
}
