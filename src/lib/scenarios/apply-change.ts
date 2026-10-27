import type { Change, Member, MemberEdit } from "./change";

// docs/domain.md, "Changes": a change applied to a team, or rejected with a reason the UI can
// show. Pure: the store runs it when a change is dispatched and the Server Action again on the
// stored team (ADR 0011), so both reject the same changes. Shapes, ranges and calendar years are
// `parseChange`'s job, which runs first in both places (ADR 0008, point 5).

/** What a change is checked against besides the team: the organization's people and categories. */
export type Roster = {
  categoryIds: ReadonlySet<string>;
  people: ReadonlyMap<string, { categoryId: string; weeklyHours: number; active: boolean }>;
};

export type Rejection =
  | "no-change"
  | "cycle"
  | "duplicate-person"
  | "wrong-category"
  | "inactive-person"
  | "impossible-dates"
  | "unknown-id"
  | "id-taken";

export type ChangeResult =
  | {
      ok: true;
      team: Member[];
      /**
       * The change as applied, to record and save: an edit that fills an open role names the weekly
       * hours it copied (rule a), so replaying it never depends on the roster again.
       */
      applied: Change;
      inverse: Change[];
    }
  | { ok: false; reason: Rejection };

const reject = (reason: Rejection) => ({ ok: false, reason }) as const;

/** The loader's order (start date, then id), so a team and its undo compare equal. */
const ordered = (team: Member[]) =>
  team.toSorted((a, b) =>
    a.startDate === b.startDate ? (a.id < b.id ? -1 : 1) : a.startDate < b.startDate ? -1 : 1,
  );

const has = (team: readonly Member[], id: string) => team.some((member) => member.id === id);

/**
 * Whether `ancestor` is `id` itself or above it in the tree. Stops on a repeat, since stored data
 * is only kept from pointing at itself, not from longer cycles.
 */
function isAncestorOrSelf(team: readonly Member[], ancestor: string, id: string | null): boolean {
  const parents = new Map(team.map((member) => [member.id, member.reportsTo]));
  const seen = new Set<string>();
  for (let at = id; at !== null && !seen.has(at); at = parents.get(at) ?? null) {
    if (at === ancestor) return true;
    seen.add(at);
  }
  return false;
}

/** The person checks, run only when a person is placed (docs/domain.md, "Changes"). */
function checkPlacedPerson(roster: Roster, member: Member): Rejection | null {
  if (member.personId === null) return null;
  const person = roster.people.get(member.personId);
  if (!person) return "unknown-id";
  if (!person.active) return "inactive-person";
  if (person.categoryId !== member.categoryId) return "wrong-category";
  return null;
}

const isDuplicatePerson = (team: readonly Member[], member: Member) =>
  member.personId !== null &&
  team.some((other) => other.id !== member.id && other.personId === member.personId);

/** Where an added or restored assignment goes: a free id and a parent in the team. */
function checkPlace(team: readonly Member[], member: Member): Rejection | null {
  if (has(team, member.id)) return "id-taken";
  if (member.reportsTo === member.id) return "cycle";
  return member.reportsTo !== null && !has(team, member.reportsTo) ? "unknown-id" : null;
}

/** What any assignment of the team must hold: its person once, and real dates. */
function checkFits(team: readonly Member[], member: Member): Rejection | null {
  if (isDuplicatePerson(team, member)) return "duplicate-person";
  return member.endDate < member.startDate ? "impossible-dates" : null;
}

function add(team: readonly Member[], roster: Roster, member: Member): ChangeResult {
  const problem =
    checkPlace(team, member) ??
    (roster.categoryIds.has(member.categoryId) ? null : "unknown-id") ??
    checkPlacedPerson(roster, member) ??
    checkFits(team, member);
  if (problem) return reject(problem);
  return {
    ok: true,
    team: ordered([...team, member]),
    applied: { type: "add", member },
    inverse: [{ type: "remove", id: member.id }],
  };
}

function move(team: readonly Member[], id: string, reportsTo: string | null): ChangeResult {
  const member = team.find((other) => other.id === id);
  if (!member) return reject("unknown-id");
  if (reportsTo !== null && reportsTo !== id && !has(team, reportsTo)) return reject("unknown-id");
  if (reportsTo === member.reportsTo) return reject("no-change");
  if (reportsTo !== null && isAncestorOrSelf(team, id, reportsTo)) return reject("cycle");
  return {
    ok: true,
    team: team.map((other) => (other.id === id ? { ...other, reportsTo } : other)),
    applied: { type: "move", id, reportsTo },
    inverse: [{ type: "move", id, reportsTo: member.reportsTo }],
  };
}

/** Removes an assignment; its direct reports move up to its parent, or become roots. */
function remove(team: readonly Member[], id: string): ChangeResult {
  const member = team.find((other) => other.id === id);
  if (!member) return reject("unknown-id");
  const reports = team.filter((other) => other.reportsTo === id).map((other) => other.id);
  return {
    ok: true,
    team: team
      .filter((other) => other.id !== id)
      .map((other) => (other.reportsTo === id ? { ...other, reportsTo: member.reportsTo } : other)),
    applied: { type: "remove", id },
    inverse: [{ type: "restore", member, reports }],
  };
}

/**
 * Puts a removed assignment back with its reports. Its person is not checked again: they were
 * valid when it was saved, and may have been deactivated since (docs/domain.md, "Changes").
 */
function restore(
  team: readonly Member[],
  member: Member,
  reports: readonly string[],
): ChangeResult {
  const problem = checkPlace(team, member) ?? checkFits(team, member);
  if (problem) return reject(problem);
  if (!reports.every((id) => has(team, id))) return reject("unknown-id");
  // A report that sits above the restored assignment would end up below itself.
  if (reports.some((id) => id === member.id || isAncestorOrSelf(team, id, member.reportsTo))) {
    return reject("cycle");
  }
  const moving = new Set(reports);
  return {
    ok: true,
    team: ordered([
      ...team.map((other) => (moving.has(other.id) ? { ...other, reportsTo: member.id } : other)),
      member,
    ]),
    applied: { type: "restore", member, reports: [...reports] },
    // Removing it moves its reports up to its parent; any that came from elsewhere go back there.
    inverse: [
      { type: "remove", id: member.id },
      ...team.flatMap((other): Change[] =>
        moving.has(other.id) && other.reportsTo !== member.reportsTo
          ? [{ type: "move", id: other.id, reportsTo: other.reportsTo }]
          : [],
      ),
    ],
  };
}

function edit(team: readonly Member[], roster: Roster, id: string, set: MemberEdit): ChangeResult {
  const member = team.find((other) => other.id === id);
  if (!member) return reject("unknown-id");

  // Only fields with a value: an explicit `undefined` never blanks one.
  const values: MemberEdit = Object.fromEntries(
    Object.entries(set).filter(([, value]) => value !== undefined),
  );
  const placesPerson = values.personId !== undefined && values.personId !== member.personId;
  // Filling an open role or changing who fills it copies the person's weekly hours (rule a),
  // unless the edit sets them too.
  const person = placesPerson && values.personId ? roster.people.get(values.personId) : undefined;
  const resolved: MemberEdit = {
    ...(person && { weeklyHours: person.weeklyHours }),
    ...values,
  };
  const next: Member = { ...member, ...resolved };

  const changed = (Object.keys(resolved) as (keyof MemberEdit)[]).filter(
    (key) => next[key] !== member[key],
  );
  if (changed.length === 0) return reject("no-change");
  const problem =
    (placesPerson ? checkPlacedPerson(roster, next) : null) ??
    (placesPerson && isDuplicatePerson(team, next) ? "duplicate-person" : null) ??
    (next.endDate < next.startDate ? "impossible-dates" : null);
  if (problem) return reject(problem);

  // Undoing a change of person puts their weekly hours back too, or re-applying the old person
  // would copy theirs from the roster again.
  const undoKeys =
    placesPerson && !changed.includes("weeklyHours")
      ? [...changed, "weeklyHours" as const]
      : changed;
  const applied: MemberEdit = Object.fromEntries(changed.map((key) => [key, next[key]]));
  const undo: MemberEdit = Object.fromEntries(undoKeys.map((key) => [key, member[key]]));
  return {
    ok: true,
    team: ordered(team.map((other) => (other.id === id ? next : other))),
    applied: {
      type: "edit",
      id,
      set: placesPerson ? { ...applied, weeklyHours: next.weeklyHours } : applied,
    },
    inverse: [{ type: "edit", id, set: undo }],
  };
}

/**
 * Applies one change to `team`, or says why it cannot. On success it returns the new team, in the
 * loader's order, the change as applied and the changes that undo it.
 */
export function applyChange(team: readonly Member[], roster: Roster, change: Change): ChangeResult {
  switch (change.type) {
    case "add":
      return add(team, roster, change.member);
    case "move":
      return move(team, change.id, change.reportsTo);
    case "remove":
      return remove(team, change.id);
    case "restore":
      return restore(team, change.member, change.reports);
    case "edit":
      return edit(team, roster, change.id, change.set);
  }
}

/** Applies changes in order, stopping at the first rejected one and saying which it was. */
export function applyChanges(
  team: readonly Member[],
  roster: Roster,
  changes: readonly Change[],
): { ok: true; team: Member[] } | { ok: false; reason: Rejection; index: number } {
  let current = [...team];
  for (const [index, change] of changes.entries()) {
    const result = applyChange(current, roster, change);
    if (!result.ok) return { ok: false, reason: result.reason, index };
    current = result.team;
  }
  return { ok: true, team: current };
}
