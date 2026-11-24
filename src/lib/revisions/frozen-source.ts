import type { FrozenValues } from "@/lib/scenarios/engine-input";

import type { RevisionSource } from "./build-revision";

// docs/domain.md, "Choosing a revision": a scenario chosen before slice 6 gets its revision from
// its frozen rows, never from current rates, with the team, price, planned period and extra costs
// it has, so no chosen result moves. Only the backfill uses it; slice 6c retires the frozen tables.

/** A revision's source with a chosen scenario's frozen rates and cost settings in place of today's. */
export function frozenSource(source: RevisionSource, frozen: FrozenValues): RevisionSource {
  return {
    ...source,
    input: {
      ...source.input,
      rates: frozen.rates,
      costSettings: {
        overheadBasisPoints: frozen.overhead,
        bufferBasisPoints: frozen.buffer,
        netAnnualHours: frozen.netAnnualHours,
        calendarWorkingHours: frozen.calendarWorkingHours,
      },
    },
  };
}
