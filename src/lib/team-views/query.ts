import { z } from "zod";

// docs/design/canvas-brief.md, "Header": the view switch's choice is in the URL, and so are the
// table's collapsed rows, so a reload or a shared link opens the team as it was left.

export const TEAM_VIEWS = ["tree", "table"] as const;

export type TeamView = (typeof TEAM_VIEWS)[number];

/** `?view=tree` or `?view=table`; without it the screen width chooses. */
export const VIEW_PARAM = "view";

/** `?collapsed=<id>,<id>`: the assignments whose reports the table hides. */
export const COLLAPSED_PARAM = "collapsed";

type Query = Pick<URLSearchParams, "get">;

const viewSchema = z.enum(TEAM_VIEWS);

const idsSchema = z.string().transform((value) => value.split(","));

/** Whether a value, from the view switch for one, names a view. */
export function isTeamView(value: string): value is TeamView {
  return viewSchema.safeParse(value).success;
}

/** The view chosen in the URL; null when it is missing or not a view. */
export function viewInQuery(query: Query): TeamView | null {
  const parsed = viewSchema.safeParse(query.get(VIEW_PARAM));
  return parsed.success ? parsed.data : null;
}

/** The view without a choice in the URL: the tree on wide screens, the table on narrow ones. */
export function defaultView(wide: boolean): TeamView {
  return wide ? "tree" : "table";
}

/** The collapsed assignments in the URL, leaving out any id that is not in the team. */
export function collapsedInQuery(query: Query, teamIds: readonly string[]): Set<string> {
  const parsed = idsSchema.safeParse(query.get(COLLAPSED_PARAM));
  if (!parsed.success) return new Set();
  const known = new Set(teamIds);
  return new Set(parsed.data.filter((id) => known.has(id)));
}

/** The query string with `view` set, every other parameter kept. */
export function queryWithView(query: URLSearchParams, view: TeamView): string {
  const next = new URLSearchParams(query);
  next.set(VIEW_PARAM, view);
  return queryString(next);
}

/**
 * The query string with the collapsed ids in the team's order, so the URL does not depend on the
 * order rows were collapsed in; without any, the parameter goes.
 */
export function queryWithCollapsed(
  query: URLSearchParams,
  collapsed: ReadonlySet<string>,
  teamIds: readonly string[],
): string {
  const next = new URLSearchParams(query);
  const ids = teamIds.filter((id) => collapsed.has(id));
  if (ids.length === 0) next.delete(COLLAPSED_PARAM);
  else next.set(COLLAPSED_PARAM, ids.join(","));
  return queryString(next);
}

/** `?…`, or "" without parameters. Commas may stay unescaped in a query (RFC 3986). */
function queryString(query: URLSearchParams): string {
  const value = query.toString().replaceAll("%2C", ",");
  return value === "" ? "" : `?${value}`;
}
