-- Rate access context for restricted tables (ADR 0005). Runs as the owner role, like 0000.

-- Whether withOrganization() granted rate access for this transaction. Fails closed: false when
-- the setting is unset, empty (as on a pooled connection after an earlier transaction) or anything
-- but exactly 'on'. pg_catalog is explicit so a caller's search_path cannot shadow current_setting.
CREATE FUNCTION app.has_rate_access() RETURNS boolean
  LANGUAGE sql
  STABLE
  AS $$ SELECT coalesce(pg_catalog.current_setting('app.rate_access', true) = 'on', false) $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.has_rate_access() FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.has_rate_access() TO squadio_app;
