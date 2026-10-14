# Squadio

Staffing simulator for consultancies: build a project team by dragging people or open roles
into a scenario and see cost, margin and effective rate update live, before you commit.

> Work in progress. Live at [squadio.utitytools.com](https://squadio.utitytools.com) once v0.1 ships.

## Getting started

Requirements: Node 24 (see `.nvmrc`), pnpm and Docker.

```bash
pnpm install
cp .env.example .env.local
docker compose up -d --wait   # Postgres 17 on 127.0.0.1:5434
pnpm dev                      # http://localhost:3000
```

## Environment variables

[`.env.example`](.env.example) lists every variable. They are validated with Zod in
[`src/lib/env/schema.ts`](src/lib/env/schema.ts): `next dev` and `next build` stop with the name of
any missing or invalid variable. Server code reads them from `src/env.ts` (server-only) and client
code from `src/env.client.ts`, never from `process.env` directly.

## Database

Postgres 17 runs in Docker from [`docker-compose.yml`](docker-compose.yml), the same file CI uses.
Two roles keep tenants apart ([ADR 0004](docs/adr/0004-tenant-isolation-with-rls.md)):
`squadio_owner` runs migrations and owns every object; the app connects as `squadio_app`, which
cannot bypass Row Level Security. Neither is a superuser, as in production, so forced Row Level
Security binds the owner too. The `postgres` superuser only runs the init script in
[`docker/postgres/init`](docker/postgres/init).

There are two databases: `squadio` for `pnpm dev` and `pnpm db:migrate`, and `squadio_test` for
`pnpm test:db` and CI. Credentials are synthetic and local-only.

The init script runs only when the data volume is created. To start again from empty databases, or
after the init script changes, recreate the volume:

```bash
docker compose down --volumes && docker compose up -d --wait
```

## License

[MIT](LICENSE)
