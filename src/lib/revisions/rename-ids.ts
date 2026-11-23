import {
  type OpenPart,
  type RestrictedPart,
  openPartSchema,
  restrictedPartSchema,
} from "./snapshot";

// ADR 0011 and ADR 0013: a visitor's copy copies the template's revisions with new ids, like the
// rest of the template, so the ids inside both parts must follow the rows they name. The parts name
// a row only under these keys; a new field holding an id must use one of them, and the tests build
// a revision with every kind of id to keep it so.

/** Keys whose value is one row's id: assignments, categories, people, projects and extra costs. */
const ID_KEYS = new Set(["id", "categoryId", "assignmentId", "reportsTo"]);
/** Keys whose value is a list of row ids. */
const ID_LIST_KEYS = new Set(["categoryIds"]);

function renameIn(value: unknown, rename: (id: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => renameIn(item, rename));
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, field]) => {
      if (ID_KEYS.has(key) && typeof field === "string") return [key, rename(field)];
      if (ID_LIST_KEYS.has(key) && Array.isArray(field)) {
        return [key, field.map((id: unknown) => (typeof id === "string" ? rename(id) : id))];
      }
      return [key, renameIn(field, rename)];
    }),
  );
}

/** An open part with every row id renamed by `rename`; throws unless it is a valid one. */
export function renameOpenPartIds(open: unknown, rename: (id: string) => string): OpenPart {
  return openPartSchema.parse(renameIn(openPartSchema.parse(open), rename));
}

/** A restricted part with every row id renamed by `rename`; throws unless it is a valid one. */
export function renameRestrictedPartIds(
  restricted: unknown,
  rename: (id: string) => string,
): RestrictedPart {
  return restrictedPartSchema.parse(renameIn(restrictedPartSchema.parse(restricted), rename));
}
