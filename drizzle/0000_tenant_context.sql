-- Tenant context for Row Level Security (ADR 0004). Runs as the owner role, which owns every
-- object; squadio_app only receives privileges. The role itself is created outside migrations.

-- Helpers for policies live in their own schema, closed to everyone but the app role.
CREATE SCHEMA app;
--> statement-breakpoint
REVOKE ALL ON SCHEMA app FROM PUBLIC;
--> statement-breakpoint
GRANT USAGE ON SCHEMA app TO squadio_app;
--> statement-breakpoint

-- The organization withOrganization() set for this transaction. Fails closed: null when unset,
-- so policies match no row; a cast error when the setting is not a uuid.
CREATE FUNCTION app.current_organization_id() RETURNS uuid
  LANGUAGE sql
  STABLE
  AS $$ SELECT nullif(current_setting('app.organization_id', true), '')::uuid $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.current_organization_id() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.current_organization_id() TO squadio_app;
--> statement-breakpoint

-- Tables and sequences the owner creates in public from now on are usable by the app role, and
-- RLS still decides which rows it sees.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO squadio_app;
--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO squadio_app;
--> statement-breakpoint

-- Postgres lets PUBLIC execute every new function, so a SECURITY DEFINER function the owner creates
-- would run with the owner's rights for the app role too. Functions are granted one by one instead.
-- No IN SCHEMA: per-schema defaults can only add to the global one, never revoke from it.
ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
