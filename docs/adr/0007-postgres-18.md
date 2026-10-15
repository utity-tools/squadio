# 0007. Postgres 18

- **Status:** accepted
- **Date:** 2026-10-15

## Context

Local development and CI ran Postgres 17 ([ADR 0001](0001-stack-and-workflow.md)), and the Neon
production project did not exist yet. Neon does not upgrade a project's major version in place:
moving later means a dump and restore into a new project, with the app's data in it. Postgres 18 has
been out for a year, and Neon offers it for new projects.

## Decision

Postgres 18 everywhere: the Docker image used locally and in CI, and the Neon production project.
Production and tests run the same major version, and a major upgrade is always a reviewed change,
never a Dependabot one.

The Docker volume mounts `/var/lib/postgresql`, where the 18 images keep each major's data in its own
directory, under a new volume name, so a 17 data directory is never mounted by mistake.

## Alternatives considered

- **Stay on 17:** no work now, but a dump and restore later, once production holds data.
- **18 on Neon only:** tests would run against a different version than production.

## Consequences

- Each developer's local database starts empty; the old `squadio_db-data` volume can be removed with
  `docker volume rm squadio_db-data`.
- `uuidv7()` is now built in, which removes one of the reasons [ADR 0004](0004-tenant-isolation-with-rls.md)
  gives against UUIDv7 ids. Revisit that choice before the first tenant table.
