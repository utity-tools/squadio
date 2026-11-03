// The Consultancy template's settings (docs/domain.md, "Configuration per organization"): what the
// demo is seeded with and what an empty organization starts with (ADR 0012, "Starting an
// organization"). Percentages are basis points (rule g).

/** Config: hours, which everyone in the organization reads. */
export const CONSULTANCY_CONFIG = { netAnnualHours: 1550, defaultWeeklyHours: 40 } as const;

/** CostConfig: money settings, restricted (ADR 0005). */
export const CONSULTANCY_COST_CONFIG = {
  overhead: 1500,
  buffer: 1000,
  targetMargin: 2500,
} as const;
