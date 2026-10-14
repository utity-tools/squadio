# Squadio

Staffing simulator for consultancies: build a project team by dragging people or open roles
into a scenario and see cost, margin and effective rate update live, before you commit.

> Work in progress. Live at [squadio.utitytools.com](https://squadio.utitytools.com) once v0.1 ships.

## Getting started

Requirements: Node 24 (see `.nvmrc`) and pnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev          # http://localhost:3000
```

## Environment variables

[`.env.example`](.env.example) lists every variable. They are validated with Zod in
[`src/lib/env/schema.ts`](src/lib/env/schema.ts): `next dev` and `next build` stop with the name of
any missing or invalid variable. Server code reads them from `src/env.ts` (server-only) and client
code from `src/env.client.ts`, never from `process.env` directly.

## License

[MIT](LICENSE)
