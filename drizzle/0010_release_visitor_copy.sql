-- ADR 0012, "Starting an organization": a signed-in visitor adopts their copy as a new
-- organization, and the copy leaves visitor_copies, so the clean-up of idle copies no longer
-- touches it. squadio_app has no privilege on visitor_copies (migration 0004), so this third
-- SECURITY DEFINER function, next to ADR 0011's two, releases the claim by the token's hash and
-- returns the copy's organization id, or null when the hash has no copy. It only ever deletes the
-- row of the hash it is given.
--
-- Its DELETE locks the claim before the adoption touches any tenant row, in the save's and the
-- clean-up's order, so the three never deadlock. A clean-up that locked the claim first wins: once
-- it commits, the DELETE finds no row and the adoption gets null.
CREATE FUNCTION app.release_visitor_copy(hash bytea) RETURNS uuid
  LANGUAGE sql
  VOLATILE
  SECURITY DEFINER
  SET search_path = pg_catalog, pg_temp
  AS $$ DELETE FROM public.visitor_copies v WHERE v.token_hash = hash RETURNING v.organization_id $$;
--> statement-breakpoint
REVOKE EXECUTE ON FUNCTION app.release_visitor_copy(bytea) FROM PUBLIC;
--> statement-breakpoint
GRANT EXECUTE ON FUNCTION app.release_visitor_copy(bytea) TO squadio_app;
