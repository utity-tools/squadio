import type { Roster } from "./apply-change";
import type { Change, Member } from "./change";
import { moveTargets } from "./move-targets";
import { type NewMemberInput, newMember } from "./new-member";

// docs/domain.md, "Changes": dragging is another way to "Add to team…" or "Move to…", and drops
// only where those would act (ADR 0008, point 1), so a drop never meets a refusal.

/** What is being dragged: a person or an open role from the bench, or an assignment of the tree. */
export type Dragged =
  | { kind: "person"; personId: string }
  | { kind: "openRole"; categoryId: string }
  | { kind: "assignment"; id: string };

/** Where the pointer is: on an assignment's node, or on the canvas around them. */
export type DropZone = { kind: "assignment"; id: string } | { kind: "canvas" };

/** The step a drop takes: the add still needs its defaults (`newMember`) to become a change. */
export type DropAction =
  | { type: "add"; filledBy: NewMemberInput["filledBy"]; reportsTo: string | null }
  | { type: "move"; id: string; reportsTo: string | null };

/**
 * What dropping `dragged` on `zone` does, or null where it does nothing. On a node, the dragged
 * one reports to it; on the canvas, it goes to the top of the team. A person must be active and
 * not on the team yet; an open role needs a category the organization knows, and can be added
 * again and again.
 */
export function dropAction(
  team: readonly Member[],
  roster: Roster,
  dragged: Dragged,
  zone: DropZone,
): DropAction | null {
  const reportsTo = zone.kind === "canvas" ? null : zone.id;
  const managerMissing = reportsTo !== null && !team.some((member) => member.id === reportsTo);
  if (dragged.kind === "openRole") {
    if (!roster.categoryIds.has(dragged.categoryId) || managerMissing) return null;
    return { type: "add", filledBy: { categoryId: dragged.categoryId }, reportsTo };
  }
  if (dragged.kind === "person") {
    if (!roster.people.get(dragged.personId)?.active) return null;
    if (team.some((member) => member.personId === dragged.personId)) return null;
    if (managerMissing) return null;
    return { type: "add", filledBy: { personId: dragged.personId }, reportsTo };
  }
  const targets = moveTargets(team, dragged.id);
  const allowed = reportsTo === null ? targets.root : targets.managers.includes(reportsTo);
  return allowed ? { type: "move", id: dragged.id, reportsTo } : null;
}

export type DropContext = {
  team: readonly Member[];
  roster: Roster;
  categories: readonly { id: string; name: string }[];
  /** Config's default weekly hours (`newMember`). */
  defaultWeeklyHours: number;
  /** Today as a `YYYY-MM-DD` date, in the caller's time zone. */
  today: string;
  /** The new assignment's id: the client makes it (docs/domain.md, "Changes"). */
  newId: () => string;
};

/**
 * The change a drop dispatches, or null where it does nothing. An add takes the defaults of "Add
 * to team…": its category's name as the project role, 100% and the project's span, and an open
 * role Config's weekly hours.
 */
export function dropChange(context: DropContext, dragged: Dragged, zone: DropZone): Change | null {
  const { team, roster } = context;
  const action = dropAction(team, roster, dragged, zone);
  if (!action) return null;
  if (action.type === "move") return action;
  const { filledBy } = action;
  const categoryId =
    "personId" in filledBy ? roster.people.get(filledBy.personId)?.categoryId : filledBy.categoryId;
  const category = context.categories.find((candidate) => candidate.id === categoryId);
  if (!category) return null;
  const member = newMember({
    id: context.newId(),
    projectRole: category.name,
    reportsTo: action.reportsTo,
    filledBy,
    team,
    roster,
    defaultWeeklyHours: context.defaultWeeklyHours,
    today: context.today,
  });
  return { type: "add", member };
}
