-- Creates the squadio_owner and squadio_app roles and the squadio database on Neon (ADR 0004), the
-- production twin of docker/postgres/init/01-roles-and-databases.sql. Runs once, by hand, as the
-- role Neon creates with the project (neondb_owner), connected to its default database. See
-- docs/operations/deploy.md.
--
-- Roles are created with SQL on purpose: Neon makes every role created in its console or API a
-- member of neon_superuser, which has BYPASSRLS. Roles created here are members of nothing.
--
-- Passwords come from the environment, so they never reach this file or the shell history:
--   SQUADIO_OWNER_PASSWORD, SQUADIO_APP_PASSWORD (Neon asks for at least 60 bits of entropy).

\set ON_ERROR_STOP on
\getenv owner_password SQUADIO_OWNER_PASSWORD
\getenv app_password SQUADIO_APP_PASSWORD
\if :{?owner_password}
\else
  \set owner_password ''
\endif
\if :{?app_password}
\else
  \set app_password ''
\endif

-- Unset, empty and short passwords stop here, with an error so psql exits non-zero.
SELECT length(:'owner_password') < 32 AS owner_weak,
       length(:'app_password') < 32 AS app_weak \gset
\if :owner_weak
  DO $$ BEGIN RAISE EXCEPTION 'SQUADIO_OWNER_PASSWORD must have at least 32 characters'; END $$;
\endif
\if :app_weak
  DO $$ BEGIN RAISE EXCEPTION 'SQUADIO_APP_PASSWORD must have at least 32 characters'; END $$;
\endif

BEGIN;

-- Owner: runs migrations and owns every object. No BYPASSRLS, so forced RLS binds it too.
CREATE ROLE squadio_owner LOGIN PASSWORD :'owner_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- App: owns nothing and cannot bypass Row Level Security. Migrations only grant it privileges.
CREATE ROLE squadio_app LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- CREATE DATABASE ... OWNER needs the creator to be able to SET ROLE to the owner. The grant goes
-- one way only: neondb_owner may act as squadio_owner, squadio_owner inherits nothing from it.
GRANT squadio_owner TO CURRENT_USER WITH INHERIT FALSE, SET TRUE;

-- Before COMMIT, so a failure leaves nothing behind: neither role may reach a superuser or
-- BYPASSRLS role through any membership.
\ir role-check.sql

COMMIT;

-- Neon's default database is for neondb_owner alone, as the bootstrap database is locally.
REVOKE CONNECT, TEMPORARY ON DATABASE neondb FROM PUBLIC;

-- Outside a transaction: Postgres does not create databases inside one.
CREATE DATABASE squadio OWNER squadio_owner;

-- The database and its public schema (owned by pg_database_owner) belong to squadio_owner, so
-- their grants are changed as it.
\connect squadio
SET ROLE squadio_owner;

-- Only the two roles connect, and only the owner creates temporary tables (owning the database
-- already includes both).
REVOKE CONNECT, TEMPORARY ON DATABASE squadio FROM PUBLIC;
GRANT CONNECT ON DATABASE squadio TO squadio_app;

REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO squadio_app;
RESET ROLE;

\echo 'squadio_owner, squadio_app and the squadio database are ready.'
