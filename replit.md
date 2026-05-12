# PackageGuard

A GUI-based package manager dashboard for pip and npm packages, with environments, version checking, smart grouping, safe update mode, snapshots, and update history audit log.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/package-guard run dev` — run the React frontend (proxied at `/`)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Optional env: `SESSION_SECRET` — session signing secret

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui + wouter + TanStack Query + Recharts
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/package-guard/` — React frontend (SPA, previewPath `/`)
- `artifacts/api-server/` — Express API server (previewPath `/api`)
- `lib/db/` — Drizzle schema + client (`@workspace/db`)
- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all API contracts)
- `lib/api-client-react/` — Orval-generated React Query hooks + Zod schemas (`@workspace/api-client-react`)
- `lib/api-zod/` — Zod input/body schemas (`@workspace/api-zod`)

## Architecture decisions

- Contract-first API: all routes defined in OpenAPI, Zod bodies validated server-side, React Query hooks used on all clients
- Drizzle ORM with PostgreSQL: schema-as-code, pushed with `db push` in dev
- Safe Mode stored in DB settings table: enables/disables minor+major updates from the sidebar toggle
- Scan logic simulates package discovery with seed data — real pip/npm subprocess calls would require `execa` + system access
- Status grouping: packages tagged with group names (ML/AI, Data, Web, Dev Tools, Others) assigned deterministically from package name

## Product

PackageGuard lets developers manage pip and npm packages across multiple environments through a clean web UI. Key capabilities:

1. **Dashboard** — summary stats (total/up-to-date/needs-update), stacked bar chart per environment, recent update activity feed
2. **Environments** — add pip/venv/conda/npm/nvm environments, scan for packages, delete environments
3. **Packages** — filterable table with search, status badges (up-to-date/patch/minor/major), Safe Mode lock icons, bulk update selected packages, check all versions
4. **Snapshots** — create named snapshots of any environment's package state, grouped by environment, one-click restore
5. **History** — full audit log of all updates with expandable error details, filterable by ecosystem/status/date range
6. **Settings** — safe mode toggle, cache duration, concurrency limit, auto-snapshot before update, theme, custom scan paths

## User preferences

- Dark mode by default
- TypeScript strict mode throughout
- All API calls use generated Orval hooks, no raw fetch

## Gotchas

- `pnpm --filter @workspace/api-spec run codegen` must be re-run whenever `lib/api-spec/openapi.yaml` changes
- Settings table always has exactly one row (auto-created on first GET /settings)
- Package status is computed from semantic version comparison: patch = same major+minor, minor = same major, major = different major
- Snapshot `restore` only creates a history entry (simulated); real restore would run `pip install pkg==version`

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- OpenAPI spec: `lib/api-spec/openapi.yaml`
- DB schema: `lib/db/src/schema.ts`
