import { describe, expect, it } from "vitest";

import {
  type BrowsedProject,
  browseProjects,
  projectsQuery,
  projectsQueryString,
  riskOf,
  standingOf,
} from "./projects";

// ADR 0017's list pattern: a search, tabs with counts, an order and filters, all of them in the
// URL so a link or a reload opens the list as it was left. Defaults never show in the URL.

const project = (
  name: string,
  client: string,
  standing: BrowsedProject["standing"],
  risk: number,
  undecided = false,
): BrowsedProject => ({ id: name, name, client, standing, risk, undecided });

const projects = [
  project("Portal", "Demo Client", null, 3, true),
  project("Mobile app", "Demo Retail", "risk", 1),
  project("Analytics", "Demo Client", "ok", 4),
  project("Migration", "Demo Bank", "risk", 0),
];

describe("projects", () => {
  it("reads each margin's standing and risk, a loss first", () => {
    const margin = (status: "green" | "amber" | "red" | null) => ({
      netMarginCents: 0,
      netMarginBasisPoints: 0,
      status,
    });
    expect(
      [margin("red"), margin("amber"), margin(null), null, margin("green")].map(riskOf),
    ).toEqual([0, 1, 2, 3, 4]);
    expect(standingOf(margin("red"))).toBe("risk");
    expect(standingOf(margin("amber"))).toBe("risk");
    expect(standingOf(margin("green"))).toBe("ok");
    expect(standingOf(margin(null))).toBeNull();
    expect(standingOf(null)).toBeNull();
  });

  it("opens on every project, riskiest first, with rate access", () => {
    const query = projectsQuery(new URLSearchParams(), true);
    expect(query).toEqual({ search: "", tab: "all", order: "risk" });

    const { tabs, shown } = browseProjects(projects, query, true, "es");
    expect(tabs).toEqual([
      { tab: "all", count: 4 },
      { tab: "decide", count: 1 },
      { tab: "risk", count: 2 },
      { tab: "ok", count: 1 },
    ]);
    expect(shown.map((p) => p.name)).toEqual(["Migration", "Mobile app", "Portal", "Analytics"]);
  });

  it("filters by tab and search, and counts each tab within the search", () => {
    const query = projectsQuery(new URLSearchParams("q=client&tab=decide&order=name"), true);
    const { tabs, shown } = browseProjects(projects, query, true, "es");
    expect(tabs.map((t) => t.count)).toEqual([2, 1, 0, 1]);
    expect(shown.map((p) => p.name)).toEqual(["Portal"]);
  });

  it("offers no money tab or order without rate access, whatever the URL says (ADR 0005)", () => {
    const query = projectsQuery(new URLSearchParams("tab=risk&order=risk"), false);
    expect(query).toEqual({ search: "", tab: "all", order: "name" });
    const { tabs, shown } = browseProjects(projects, query, false, "es");
    expect(tabs.map((t) => t.tab)).toEqual(["all", "decide"]);
    expect(shown.map((p) => p.name)).toEqual(["Analytics", "Migration", "Mobile app", "Portal"]);
  });

  it("falls back to the defaults for values it does not know", () => {
    expect(projectsQuery(new URLSearchParams("tab=open&order=date"), true)).toEqual({
      search: "",
      tab: "all",
      order: "risk",
    });
  });

  it("writes only what differs from the defaults, keeping every other parameter", () => {
    const current = new URLSearchParams("access=none&q=old");
    expect(projectsQueryString(current, { search: "", tab: "all", order: "risk" }, true)).toBe(
      "?access=none",
    );
    expect(
      projectsQueryString(current, { search: " bank ", tab: "risk", order: "name" }, true),
    ).toBe("?access=none&q=bank&tab=risk&order=name");
    expect(
      projectsQueryString(
        new URLSearchParams(),
        projectsQuery(new URLSearchParams(), false),
        false,
      ),
    ).toBe("");
  });
});
