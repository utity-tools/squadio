-- Runs once, as the bootstrap superuser, when the data volume is created (ADR 0004). Passwords are
-- synthetic and local-only; on Neon, infra/neon/bootstrap.sql creates both roles (ADR 0006).

-- Owner: runs migrations and owns every object. Not a superuser and no BYPASSRLS, as in Neon, so
-- forced Row Level Security binds it too.
CREATE ROLE squadio_owner LOGIN PASSWORD 'squadio_owner_dev'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- App: owns nothing and cannot bypass Row Level Security. Migrations only grant it privileges.
CREATE ROLE squadio_app LOGIN PASSWORD 'squadio_app_dev'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;

-- squadio for development, squadio_test for database tests and CI.
CREATE DATABASE squadio OWNER squadio_owner;
CREATE DATABASE squadio_test OWNER squadio_owner;

-- Only the two roles connect, and only the owner creates temporary tables. Owning a database
-- already includes both. The bootstrap database is for the superuser alone.
REVOKE CONNECT, TEMPORARY ON DATABASE squadio, squadio_test FROM PUBLIC;
GRANT CONNECT ON DATABASE squadio, squadio_test TO squadio_app;
REVOKE CONNECT, TEMPORARY ON DATABASE postgres FROM PUBLIC;

-- In each database, public belongs to pg_database_owner (Postgres 15+), so squadio_owner creates
-- objects there; nobody else does.
\connect squadio
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO squadio_app;

\connect squadio_test
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO squadio_app;
