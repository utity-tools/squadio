/** The ids of an assignment chain that loops back on itself, or null when the tree has no cycle. */
export function findReportsToCycle(
  assignments: readonly { readonly id: string; readonly reportsTo?: string | null }[],
): string[] | null {
  const managerOf = new Map(assignments.map(({ id, reportsTo }) => [id, reportsTo ?? null]));
  const acyclic = new Set<string>();

  for (const { id } of assignments) {
    const chain: string[] = [];
    let current: string | null = id;
    while (current !== null && !acyclic.has(current)) {
      const seen = chain.indexOf(current);
      if (seen !== -1) return chain.slice(seen);
      chain.push(current);
      current = managerOf.get(current) ?? null;
    }
    for (const visited of chain) acyclic.add(visited);
  }
  return null;
}
