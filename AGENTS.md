# AGENTS.md

## Cursor Cloud specific instructions

This repo (VEKTA) is a single-page **Vite + React + TypeScript** app. The package manager is
**pnpm** (`pnpm-lock.yaml` + `pnpm-workspace.yaml`); a `bun.lock` also exists but pnpm is
authoritative. Standard commands live in `package.json` `scripts` — use those rather than
duplicating them here. Dependencies are refreshed automatically by the startup update script
(`pnpm install`, which runs `prisma generate` via `postinstall`).

### Running the app (dev)
- `pnpm dev` serves the app at `http://127.0.0.1:5173/`. Host/port are overridable via
  `DEV_HOST` / `DEV_PORT`; set `DEV_HTTPS=true` for a self-signed HTTPS dev server.
- `pnpm build` (Vite production build) and `pnpm preview` also work with no extra config.
- Lint: `pnpm lint` (ESLint) / `pnpm lint:oxlint`. Tests: `pnpm test` (Vitest).

### Non-obvious caveats
- **No secrets are required to run the frontend.** When `VITE_SUPABASE_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` are unset, the app falls back to a **mock storage backend**
  (`src/integrations/supabase/mock-client.ts`) and prints a `[Supabase] Missing …` warning.
- In this mock/unconfigured mode **auth is disabled**: `useAuth` uses `PublicAuthProvider`
  (always `user: null`), so every `ProtectedRoute` redirects to `/login`, which shows
  "Authentication temporarily unavailable". `VITE_DEMO_MODE=true` alone does **not** bypass
  this (there is still no user). Reaching the authenticated app (onboarding, dashboard,
  investor match, settings) therefore requires **real Supabase credentials** in `.env.local`
  (`VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`).
- Public routes that work fully in mock mode: `/` (landing), `/access` (request-access lead
  capture → redirects to `/referrals` waitlist dashboard), `/fresh-capital`, `/trending-startups`.
  The `/access` → waitlist flow is the recommended end-to-end smoke test when no Supabase creds
  are present.
- The mock `/access` submission is remembered in the browser's **local storage**
  (`sessionToken`). If `/access` shows an "already submitted" success state instead of a blank
  form, clear site storage (`localStorage.clear()`) and reload to re-test the form.
- The Supabase **CLI** binary fails to install (`node_modules/.bin/supabase` ENOENT) because its
  build is intentionally disabled in `pnpm-workspace.yaml` (`allowBuilds: supabase: false`). This
  is expected and does not affect running/building the frontend; it only matters for
  `supabase:*` / edge-function scripts.
- Many `db:*`, `vc:*`, `enrich:*`, `scrape:*`, and `supabase:*` scripts are batch/data tooling
  that need `DATABASE_URL` and/or third-party API keys (see `.env.example`). They are **not**
  needed to run, build, lint, or test the app.

### Known pre-existing state on `main` (not environment issues)
- `pnpm lint` reports many pre-existing errors/warnings.
- `pnpm test` currently has a few pre-existing failures (e.g. a `London, UK, UK` location
  normalization test and a `GrowthMetrics` placeholder query). The Vitest runner itself works;
  these are code-level failures, not setup problems.
