-- Fails if squadio_owner or squadio_app can reach a superuser or BYPASSRLS role through any
-- membership (ADR 0004). bootstrap.sql runs it before COMMIT, so a failure leaves nothing behind;
-- the preview workflow runs it on every preview branch after resetting its passwords (ADR 0009).
-- Reads only pg_roles, so any role can run it.
DO $$
DECLARE
  leaks text;
BEGIN
  SELECT string_agg(format('%s -> %s', member.rolname, granted.rolname), ', ')
    INTO leaks
    FROM pg_roles member
    CROSS JOIN pg_roles granted
   WHERE member.rolname IN ('squadio_owner', 'squadio_app')
     AND (granted.rolsuper OR granted.rolbypassrls)
     AND pg_has_role(member.oid, granted.oid, 'MEMBER');

  IF leaks IS NOT NULL THEN
    RAISE EXCEPTION 'roles can bypass RLS: %', leaks;
  END IF;
END
$$;
