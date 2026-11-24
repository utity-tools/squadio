import type { MarginStatus } from "@/lib/costing/calculate-scenario";
import type { LoadedScenario, TeamAssignment } from "@/lib/scenarios/scenario-view";
import { type Amount, type Ledger, type LedgerLine, ledger } from "@/lib/summary/summary";

// docs/domain.md, "Comparing scenarios": two or three scenarios of one project side by side. A
// view, not data: it reads the results the scenario page already gets and adds only differences
// from the baseline, never a figure of its own. Money only with rate access (ADR 0005).

/** A scenario as the comparison takes it: its id, and its chosen revision's number if it shows one. */
export type ComparedScenario = { id: string; revision: number | null; view: LoadedScenario };

/** A figure in a column: an amount, why it has none, or a category absent from the team. */
export type Figure = Amount | { state: "absent" };

/**
 * A column's figure minus the baseline's, exact. Missing when either figure is undetermined or not
 * applicable, saying which column lacks it: never computed from 0 or from a subtotal.
 */
export type Change =
  { state: "change"; value: number } | { state: "missing"; in: "column" | "baseline" | "both" };

/** One column's figure and its difference from the baseline; null in the baseline's column. */
export type Cell = { figure: Figure; change: Change | null };

export type ComparisonColumn = {
  id: string;
  name: string;
  chosen: boolean;
  /**
   * The number of the chosen revision it shows, as stored (docs/domain.md, "Choosing a revision");
   * null for one costed with the current values.
   */
  revision: number | null;
  people: number;
  openRoles: number;
};

/** What a seat holds, as the team differences compare it: no money. */
export type Seat = {
  category: string;
  projectRole: string;
  allocation: number;
  weeklyHours: number;
  startDate: string;
  endDate: string;
};

export type SeatField = "category" | "projectRole" | "allocation" | "weeklyHours" | "dates";

/**
 * How a person's seats in a column differ from the baseline's. `seats` when they hold more than
 * one seat on either side and those differ: they are not matched one by one.
 */
export type PersonChange =
  | { kind: "enters" | "leaves" | "same" | "absent" }
  | { kind: "changes"; fields: (SeatField | "seats")[] };

export type PersonRow = {
  person: { id: string; name: string };
  /** The person's seats in each column, empty when they are not on that team. */
  seats: Seat[][];
  /** Per column; null in the baseline's. */
  changes: (PersonChange | null)[];
};

export type CategoryRow = {
  categoryId: string;
  name: string;
  nominalHours: Cell[];
  effectiveHours: Cell[];
  /** Open roles cannot be matched one by one: how many, and their nominal hours. */
  openRoles: Cell[];
  openRoleHours: Cell[];
};

export type MoneyLineKey =
  | "revenue"
  | "staffCost"
  | "extraCosts"
  | "directCost"
  | "directMargin"
  | "overhead"
  | "buffer"
  | "totalCost"
  | "netMargin"
  | "effectiveRate";

/** A result line across the columns; a margin also has its % in basis points. */
export type MoneyRow = { key: MoneyLineKey; cells: Cell[]; basisPoints?: Cell[] };

export type ComparisonMoney = {
  lines: MoneyRow[];
  /**
   * Each category's staff cost, in the order of `categories`. `small` when 1 or 2 active people
   * share it, so its cost may reveal a salary (rule j): the count is the organization's.
   */
  categories: { categoryId: string; cost: Cell[]; small: boolean }[];
  /** Each column's extra costs, by label and kind, without a difference. */
  extraCosts: {
    id: string;
    label: string | null;
    kind: Extract<LedgerLine, { key: "extraCost" }>["kind"];
    cents: Amount;
  }[][];
  status: (MarginStatus | null)[];
  targetMarginBasisPoints: number;
};

export type Comparison = {
  project: { id: string; name: string; pricingModel: LoadedScenario["project"]["pricingModel"] };
  /** The baseline first. */
  columns: ComparisonColumn[];
  hours: { nominal: Cell[]; effective: Cell[] };
  /** The union of the teams: the baseline's in its order, then the others' new ones. */
  categories: CategoryRow[];
  /** The baseline's people in its order, then the others' new ones. */
  people: PersonRow[];
} & ({ rateAccess: true; money: ComparisonMoney } | { rateAccess: false });

/** The difference of two figures; a category absent from a team counts as 0. */
export function difference(column: Figure, baseline: Figure): Change {
  const value = (figure: Figure) =>
    typeof figure === "number" ? figure : figure.state === "absent" ? 0 : null;
  const a = value(column);
  const b = value(baseline);
  if (a !== null && b !== null) return { state: "change", value: a - b };
  return { state: "missing", in: a === null ? (b === null ? "both" : "column") : "baseline" };
}

/** A row's cells, the baseline's first with no difference. */
function cells(figures: readonly Figure[]): Cell[] {
  const [baseline] = figures;
  if (baseline === undefined) return [];
  return figures.map((figure, index) => ({
    figure,
    change: index === 0 ? null : difference(figure, baseline),
  }));
}

/** The extra costs' sum: each one's rounded line, undetermined if any is (docs/domain.md). */
function extraSum(lines: readonly LedgerLine[]): Amount {
  const amounts = lines.flatMap((line) => (line.key === "extraCost" ? [line.cents] : []));
  const missing = amounts.filter((amount) => typeof amount !== "number");
  if (missing.length === 0) {
    return amounts.reduce<number>((sum, amount) => sum + (amount as number), 0);
  }
  const categories = new Set<string>();
  let price = false;
  let period = false;
  let rates: "cost" | "sellRate" | "both" = "cost";
  for (const amount of missing) {
    if (amount.state !== "undetermined") continue;
    amount.missing.categories.forEach((category) => categories.add(category));
    price ||= amount.missing.price;
    period ||= amount.missing.period;
    if (amount.missing.rates !== "cost") rates = amount.missing.rates;
  }
  return {
    state: "undetermined",
    missing: { categories: [...categories], rates, price, period },
  };
}

function lineOf(summary: Ledger, key: LedgerLine["key"]): LedgerLine {
  const line = summary.lines.find((candidate) => candidate.key === key);
  if (!line) throw new Error(`The summary has no ${key} line`);
  return line;
}

/** Ids in first appearance order: each list's new ones after the earlier lists'. */
function union<T>(lists: readonly (readonly T[])[], idOf: (item: T) => string): T[] {
  const seen = new Map<string, T>();
  for (const list of lists)
    for (const item of list) if (!seen.has(idOf(item))) seen.set(idOf(item), item);
  return [...seen.values()];
}

const seatOf = (member: TeamAssignment): Seat => ({
  category: member.category.name,
  projectRole: member.projectRole,
  allocation: member.allocation,
  weeklyHours: member.weeklyHours,
  startDate: member.startDate,
  endDate: member.endDate,
});

const seatKey = (seat: Seat) =>
  [
    seat.startDate,
    seat.endDate,
    seat.category,
    seat.projectRole,
    seat.allocation,
    seat.weeklyHours,
  ].join("|");

function seatFields(before: Seat, after: Seat): SeatField[] {
  const fields: SeatField[] = [];
  if (before.category !== after.category) fields.push("category");
  if (before.projectRole !== after.projectRole) fields.push("projectRole");
  if (before.allocation !== after.allocation) fields.push("allocation");
  if (before.weeklyHours !== after.weeklyHours) fields.push("weeklyHours");
  if (before.startDate !== after.startDate || before.endDate !== after.endDate) {
    fields.push("dates");
  }
  return fields;
}

/** How a person's seats changed; people are matched by person, never by assignment id. */
export function personChange(baseline: readonly Seat[], column: readonly Seat[]): PersonChange {
  if (baseline.length === 0) return { kind: column.length === 0 ? "absent" : "enters" };
  if (column.length === 0) return { kind: "leaves" };
  const [before] = baseline;
  const [after] = column;
  if (baseline.length === 1 && column.length === 1 && before && after) {
    const fields = seatFields(before, after);
    return fields.length === 0 ? { kind: "same" } : { kind: "changes", fields };
  }
  const keys = (seats: readonly Seat[]) => seats.map(seatKey).sort().join("\n");
  return keys(baseline) === keys(column)
    ? { kind: "same" }
    : { kind: "changes", fields: ["seats"] };
}

/** Each assignment's hours, as the result gives them. */
function hoursOf(view: LoadedScenario) {
  const list = view.rateAccess ? view.result.assignments : view.assignments;
  return new Map(list.map((hours) => [hours.id, hours]));
}

/**
 * The baseline first: the chosen scenario when it is among them, or else the first picked. Throws
 * unless there are two or three distinct scenarios of one project, read with the same access.
 */
export function orderColumns(scenarios: readonly ComparedScenario[]): ComparedScenario[] {
  if (scenarios.length < 2 || scenarios.length > 3) {
    throw new Error("A comparison takes two or three scenarios");
  }
  if (new Set(scenarios.map(({ id }) => id)).size !== scenarios.length) {
    throw new Error("A scenario is compared once");
  }
  const [first] = scenarios;
  if (!first) throw new Error("A comparison takes two or three scenarios");
  if (scenarios.some(({ view }) => view.project.id !== first.view.project.id)) {
    throw new Error("Only scenarios of the same project are compared");
  }
  if (scenarios.some(({ view }) => view.rateAccess !== first.view.rateAccess)) {
    throw new Error("Every scenario is read with the same access");
  }
  const baseline = Math.max(
    0,
    scenarios.findIndex(({ view }) => view.scenario.chosen),
  );
  const head = scenarios[baseline];
  if (!head) throw new Error("A comparison takes two or three scenarios");
  return [head, ...scenarios.filter((_, i) => i !== baseline)];
}

/** Two or three scenarios of one project, side by side (docs/domain.md, "Comparing scenarios"). */
export function compareScenarios(scenarios: readonly ComparedScenario[]): Comparison {
  const ordered = orderColumns(scenarios);
  const views = ordered.map(({ view }) => view);
  const [first] = views;
  if (!first) throw new Error("A comparison takes two or three scenarios");

  const columns = ordered.map(({ id, revision, view }): ComparisonColumn => {
    const people = new Set(view.team.flatMap(({ person }) => (person ? [person.id] : [])));
    return {
      id,
      name: view.scenario.name,
      chosen: view.scenario.chosen,
      revision,
      people: people.size,
      openRoles: view.team.filter(({ person }) => person === null).length,
    };
  });

  const hours = views.map(hoursOf);
  const totals = views.map((view) => (view.rateAccess ? view.result.hours : view.hours));

  const categoryList = union(
    views.map((view) => view.team.map(({ category }) => category)),
    ({ id }) => id,
  );
  // Hours per category, from each assignment's: they never depend on money.
  const categoryHours = (index: number, categoryId: string, open: boolean) => {
    const view = views[index] as LoadedScenario;
    const members = view.team.filter(
      (m) => m.category.id === categoryId && (!open || m.person === null),
    );
    if (members.length === 0 && !open) return null;
    const sum = (key: "nominalHours" | "effectiveHours") =>
      members.reduce((total, m) => total + (hours[index]?.get(m.id)?.[key] ?? 0), 0);
    return {
      count: members.length,
      nominal: sum("nominalHours"),
      effective: sum("effectiveHours"),
    };
  };
  const categories = categoryList.map(({ id, name }): CategoryRow => {
    const all = views.map((_, index) => categoryHours(index, id, false));
    const open = views.map((_, index) => categoryHours(index, id, true));
    const figure = (value: number | undefined): Figure => value ?? { state: "absent" };
    return {
      categoryId: id,
      name,
      nominalHours: cells(all.map((h) => figure(h?.nominal))),
      effectiveHours: cells(all.map((h) => figure(h?.effective))),
      openRoles: cells(open.map((h) => h?.count ?? 0)),
      openRoleHours: cells(open.map((h) => h?.nominal ?? 0)),
    };
  });

  const peopleList = union(
    views.map((view) => view.team.flatMap(({ person }) => (person ? [person] : []))),
    ({ id }) => id,
  );
  const people = peopleList.map((person): PersonRow => {
    const seats = views.map((view) =>
      view.team.filter((m) => m.person?.id === person.id).map(seatOf),
    );
    const baseline = seats[0] ?? [];
    return {
      person,
      seats,
      changes: seats.map((column, index) => (index === 0 ? null : personChange(baseline, column))),
    };
  });

  const open = {
    project: {
      id: first.project.id,
      name: first.project.name,
      pricingModel: first.project.pricingModel,
    },
    columns,
    hours: {
      nominal: cells(totals.map((h) => h.nominal)),
      effective: cells(totals.map((h) => h.effective)),
    },
    categories,
    people,
  };

  if (!first.rateAccess) return { ...open, rateAccess: false };

  const summaries = views.map((view) => {
    if (!view.rateAccess) throw new Error("Every scenario is read with the same access");
    return { view, summary: ledger(view) };
  });
  const row = (key: Exclude<MoneyLineKey, "extraCosts" | "effectiveRate">): MoneyRow => {
    const lines = summaries.map(({ summary }) => lineOf(summary, key));
    return {
      key,
      cells: cells(lines.map((line) => line.cents)),
      ...(key === "directMargin" || key === "netMargin"
        ? {
            basisPoints: cells(
              lines.map((line) => {
                if (!("basisPoints" in line)) throw new Error(`The ${key} line has no %`);
                return line.basisPoints;
              }),
            ),
          }
        : {}),
    };
  };
  const money: ComparisonMoney = {
    lines: [
      row("revenue"),
      row("staffCost"),
      { key: "extraCosts", cells: cells(summaries.map(({ summary }) => extraSum(summary.lines))) },
      row("directCost"),
      row("directMargin"),
      row("overhead"),
      row("buffer"),
      row("totalCost"),
      row("netMargin"),
      {
        key: "effectiveRate",
        cells: cells(summaries.map(({ summary }) => summary.figures.effectiveRateCents)),
      },
    ],
    categories: categoryList.map(({ id }) => ({
      categoryId: id,
      cost: cells(
        summaries.map(
          ({ summary }): Figure =>
            summary.categories.find((line) => line.categoryId === id)?.costCents ?? {
              state: "absent",
            },
        ),
      ),
      small: summaries.some(({ summary }) =>
        summary.categories.some((line) => line.categoryId === id && line.activePeople !== null),
      ),
    })),
    extraCosts: summaries.map(({ summary }) =>
      summary.lines.flatMap((line) =>
        line.key === "extraCost"
          ? [{ id: line.id, label: line.label, kind: line.kind, cents: line.cents }]
          : [],
      ),
    ),
    status: summaries.map(({ summary }) => summary.headline.status),
    // Target margin is the organization's current one for every column (rule b).
    targetMarginBasisPoints: summaries[0]?.summary.headline.targetMarginBasisPoints ?? 0,
  };
  return { ...open, rateAccess: true, money };
}
