-- docs/domain.md, "What choosing freezes": until slice 7, the demo seed marked scenarios chosen
-- without frozen rows, and visitors' copies of the demo copied them that way. This writes the rows
-- choosing writes (freezeScenario in src/db/choose-scenario.ts), from the current values, for every
-- chosen scenario that has none: one frozen rate per category its team uses, and its frozen cost
-- config. A scenario with a category without a rate is skipped, as choosing refuses it (rule k).
--
-- It runs as the owner, whom FORCE ROW LEVEL SECURITY subjects to the policies, so it sets each
-- organization's context in turn, with rate access. The only organizations are the demo and the
-- visitors' copies (no sign-up before v0.5); visitor_copies lists the copies and the owner reads
-- it. Every statement also names the organization, so a role that bypasses Row Level Security
-- (a superuser, say) writes the same rows. Running it again changes nothing.
--
-- The calendar is a code constant (rule h): working days per year, as calendarWorkingHours
-- counts them, are written out here for the years the calendar lists today. A team is costed with
-- the year of its earliest start, or the calendar's first year when that year is not listed.
DO $$
DECLARE
  organization uuid;
  pending uuid[];
BEGIN
  FOR organization IN
    SELECT '6d656d6f-0000-4000-8000-000000000001'::uuid
    UNION
    SELECT organization_id FROM public.visitor_copies
  LOOP
    PERFORM set_config('app.organization_id', organization::text, true);
    PERFORM set_config('app.rate_access', 'on', true);

    -- The chosen scenarios to freeze, collected before either insert so both see the same ones.
    pending := ARRAY(
      SELECT s.id
      FROM public.scenarios s
      WHERE s.organization_id = organization
        AND s.chosen
        -- Both cost settings rows exist, so the two inserts below write both or neither.
        AND EXISTS (SELECT 1 FROM public.config c WHERE c.organization_id = organization)
        AND EXISTS (SELECT 1 FROM public.cost_config cc WHERE cc.organization_id = organization)
        AND NOT EXISTS (SELECT 1 FROM public.frozen_cost_config f WHERE f.scenario_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM public.frozen_rates f WHERE f.scenario_id = s.id)
        -- Rule k: every category of the team has a rate.
        AND NOT EXISTS (
          SELECT 1
          FROM public.assignments a
          LEFT JOIN public.category_rates r
            ON r.organization_id = a.organization_id AND r.category_id = a.category_id
          WHERE a.organization_id = s.organization_id AND a.scenario_id = s.id
            AND r.category_id IS NULL
        )
    );

    -- The fully loaded annual cost as the engine takes it: rounded once to the cent, half away
    -- from zero (toEngineRate), or the manual cost per hour when it is set.
    INSERT INTO public.frozen_rates
      (organization_id, scenario_id, category_id, fully_loaded_annual_cost, manual_cost_per_hour,
       sell_rate)
    SELECT s.organization_id, s.id, r.category_id,
      CASE WHEN r.manual_cost_per_hour IS NULL THEN
        round(r.gross_annual_salary * (100 + r.social_security_pct) / 100 + r.other_yearly_costs, 2)
      END,
      r.manual_cost_per_hour,
      r.sell_rate
    FROM public.scenarios s
    JOIN (SELECT DISTINCT organization_id, scenario_id, category_id FROM public.assignments) used
      ON used.organization_id = s.organization_id AND used.scenario_id = s.id
    JOIN public.category_rates r
      ON r.organization_id = used.organization_id AND r.category_id = used.category_id
    WHERE s.organization_id = organization AND s.id = ANY (pending);

    INSERT INTO public.frozen_cost_config
      (organization_id, scenario_id, overhead_pct, buffer_pct, net_annual_hours,
       calendar_working_hours)
    SELECT s.organization_id, s.id,
      coalesce(pp.overhead_pct, cc.overhead_pct),
      coalesce(pp.buffer_pct, cc.buffer_pct),
      c.net_annual_hours,
      -- A full-time week over the year: working days × weekly hours / 5.
      calendar.working_days * c.default_weekly_hours / 5
    FROM public.scenarios s
    JOIN public.config c ON c.organization_id = s.organization_id
    JOIN public.cost_config cc ON cc.organization_id = s.organization_id
    LEFT JOIN public.project_pricing pp
      ON pp.organization_id = s.organization_id AND pp.project_id = s.project_id
    CROSS JOIN LATERAL (
      SELECT extract(year FROM min(a.start_date))::int AS year
      FROM public.assignments a
      WHERE a.organization_id = s.organization_id AND a.scenario_id = s.id
    ) earliest
    JOIN (VALUES (2026, 254), (2027, 254), (2028, 251)) AS calendar (year, working_days)
      ON calendar.year = CASE
        WHEN earliest.year IN (2026, 2027, 2028) THEN earliest.year
        ELSE 2026
      END
    WHERE s.organization_id = organization AND s.id = ANY (pending);
  END LOOP;
  -- The migrations share one transaction: leave no organization or rate access in force after it.
  PERFORM set_config('app.organization_id', '', true);
  PERFORM set_config('app.rate_access', '', true);
END
$$;
