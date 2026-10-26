import type { TeamAssignment } from "@/db/load-scenario";

// Test data for the views of the team: synthetic, like every fixture.

export const guideSpan = { start: "2027-04-01", end: "2027-09-29", workingDays: 130 };

const seat = { weeklyHours: 40, startDate: guideSpan.start, endDate: guideSpan.end };

/** The guide case: a project manager with three reports, the DevOps seat still open. */
export const guideTeam: TeamAssignment[] = [
  {
    ...seat,
    id: "pm",
    projectRole: "Project manager",
    category: { id: "c-pm", name: "Project Manager" },
    person: { id: "p-pm", name: "Project Manager 1" },
    reportsTo: null,
    allocation: 50,
  },
  {
    ...seat,
    id: "lead",
    projectRole: "Tech lead",
    category: { id: "c-senior", name: "Senior Developer" },
    person: { id: "p-senior", name: "Senior Developer 1" },
    reportsTo: "pm",
    allocation: 100,
  },
  {
    ...seat,
    id: "front",
    projectRole: "",
    category: { id: "c-front", name: "Frontend Developer" },
    person: { id: "p-front", name: "Frontend Developer 1" },
    reportsTo: "pm",
    allocation: 100,
    endDate: "2027-06-30",
  },
  {
    ...seat,
    id: "ops",
    projectRole: "DevOps engineer",
    category: { id: "c-ops", name: "DevOps Engineer" },
    person: null,
    reportsTo: "pm",
    allocation: 50,
  },
];

/** The same hours for every assignment, as the engine would give them. */
export const guideHours = guideTeam.map(({ id }) => ({
  id,
  nominalHours: 1040,
  effectiveHours: 897.5,
}));
