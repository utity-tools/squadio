// @vitest-environment node
import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  collapsedInQuery,
  defaultView,
  isTeamView,
  queryWithCollapsed,
  queryWithView,
  viewInQuery,
} from "./query";

const params = (query: string) => new URLSearchParams(query);

const ids = ["pm", "lead", "ops"];

describe("viewInQuery", () => {
  it("reads the tree or the table", () => {
    expect(viewInQuery(params("view=tree"))).toBe("tree");
    expect(viewInQuery(params("?view=table&x=1"))).toBe("table");
  });

  it("treats a missing or invalid view as absent", () => {
    expect(viewInQuery(params(""))).toBeNull();
    expect(viewInQuery(params("view="))).toBeNull();
    expect(viewInQuery(params("view=TABLE"))).toBeNull();
    expect(viewInQuery(params("view=grid"))).toBeNull();
  });
});

describe("isTeamView", () => {
  it("accepts only the tree and the table", () => {
    expect(isTeamView("tree")).toBe(true);
    expect(isTeamView("table")).toBe(true);
    expect(isTeamView("")).toBe(false);
    expect(isTeamView("grid")).toBe(false);
  });
});

describe("defaultView", () => {
  it("is the tree on wide screens and the table on narrow ones", () => {
    expect(defaultView(true)).toBe("tree");
    expect(defaultView(false)).toBe("table");
  });
});

describe("collapsedInQuery", () => {
  it("reads comma-separated assignment ids", () => {
    expect(collapsedInQuery(params("collapsed=pm,ops"), ids)).toEqual(new Set(["pm", "ops"]));
    expect(collapsedInQuery(params("collapsed=pm%2Cops"), ids)).toEqual(new Set(["pm", "ops"]));
  });

  it("is empty without the parameter", () => {
    expect(collapsedInQuery(params("view=table"), ids)).toEqual(new Set());
  });

  it("drops ids that are empty or not in the team", () => {
    expect(collapsedInQuery(params("collapsed=,gone,lead,,"), ids)).toEqual(new Set(["lead"]));
    expect(collapsedInQuery(params("collapsed="), ids)).toEqual(new Set());
  });
});

describe("queryWithView", () => {
  it("sets the view and keeps every other parameter", () => {
    expect(queryWithView(params("a=1&view=tree&collapsed=pm,ops"), "table")).toBe(
      "?a=1&view=table&collapsed=pm,ops",
    );
    expect(queryWithView(params(""), "tree")).toBe("?view=tree");
  });
});

describe("queryWithCollapsed", () => {
  it("writes the collapsed ids in the team's order, commas unescaped", () => {
    expect(queryWithCollapsed(params("view=table"), new Set(["ops", "pm"]), ids)).toBe(
      "?view=table&collapsed=pm,ops",
    );
  });

  it("leaves out ids that are not in the team", () => {
    expect(queryWithCollapsed(params(""), new Set(["gone", "lead"]), ids)).toBe("?collapsed=lead");
  });

  it("removes the parameter when nothing is collapsed", () => {
    expect(queryWithCollapsed(params("a=1&collapsed=pm"), new Set(), ids)).toBe("?a=1");
    expect(queryWithCollapsed(params("collapsed=pm"), new Set(), ids)).toBe("");
  });

  it("reads back what it writes", () => {
    fc.assert(
      fc.property(fc.subarray(ids), fc.string(), (chosen, other) => {
        const query = queryWithCollapsed(
          params(`q=${encodeURIComponent(other)}`),
          new Set(chosen),
          ids,
        );
        const read = params(query);
        expect(collapsedInQuery(read, ids)).toEqual(new Set(chosen));
        expect(read.get("q")).toBe(other);
      }),
    );
  });
});
