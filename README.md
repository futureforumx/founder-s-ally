# Founder's Ally

A Supabase-powered application for founder tools and investor relations.

---

## Environment Setup

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

Required front-end variables:

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |
| `VITE_SUPABASE_PROJECT_ID` | Supabase project ref |

> ⚠️ **Never commit `.env` to git.** It is listed in `.gitignore`.

---

## Supabase Clone Pipeline

A GitHub Actions workflow (`.github/workflows/clone-supabase.yml`) performs a
full clone of the source Supabase project into a destination project, including:

- **Database** — schema, data, RLS policies, functions, triggers (`pg_dump` / `pg_restore`)
- **Edge Functions** — all functions under `supabase/functions/` (Supabase CLI)
- **Storage** — all buckets and objects (`scripts/clone_storage.ts`)
- **Auth users** — all users with metadata (`scripts/clone_auth_users.ts`)

### Required GitHub Actions Secrets

Add the following secrets to **Settings → Secrets and variables → Actions** in
the `futureforumx/founder-s-ally` repository:

#### Common

| Secret | Description |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI personal access token (Dashboard → Account → Access Tokens) |

#### Source project (`fuxzlmporikuhotzcqyc`)

| Secret | Example value |
|---|---|
| `SRC_PROJECT_REF` | `fuxzlmporikuhotzcqyc` |
| `SRC_SUPABASE_URL` | `https://fuxzlmporikuhotzcqyc.supabase.co` |
| `SRC_SUPABASE_SERVICE_ROLE_KEY` | Service role key from the source dashboard |
| `SRC_DB_HOST` | `db.fuxzlmporikuhotzcqyc.supabase.co` |
| `SRC_DB_PORT` | `5432` |
| `SRC_DB_NAME` | `postgres` |
| `SRC_DB_USER` | `postgres` |
| `SRC_DB_PASSWORD` | Database password from the source dashboard |

#### Destination project (`awdtlonduhrpvxerrmst`)

| Secret | Example value |
|---|---|
| `DST_PROJECT_REF` | `awdtlonduhrpvxerrmst` |
| `DST_SUPABASE_URL` | `https://awdtlonduhrpvxerrmst.supabase.co` |
| `DST_SUPABASE_SERVICE_ROLE_KEY` | Service role key from the destination dashboard |
| `DST_DB_HOST` | `db.awdtlonduhrpvxerrmst.supabase.co` |
| `DST_DB_PORT` | `5432` |
| `DST_DB_NAME` | `postgres` |
| `DST_DB_USER` | `postgres` |
| `DST_DB_PASSWORD` | Database password from the destination dashboard |

### Running the Workflow

1. Go to **Actions → Clone Supabase Project → Run workflow**.
2. Fill in the inputs:
   - **src_project_ref** — source project ref (default: `fuxzlmporikuhotzcqyc`)
   - **dst_project_ref** — destination project ref (default: `awdtlonduhrpvxerrmst`)
   - **migrate_auth_users** — migrate Auth users (default: `true`)
   - **migrate_storage** — migrate Storage (default: `true`)
   - **dump_format** — `custom` (binary, recommended) or `plain` (SQL)
   - **confirm** — type `CLONE` to proceed (required guardrail)
3. Click **Run workflow**.

> ⚠️ The workflow **will fail immediately** if:
> - The `confirm` input is not exactly `CLONE`.
> - Source and destination project refs are the same.

### Workflow Jobs

| Job | Description | Depends on |
|---|---|---|
| `validate` | Checks inputs and prints summary | — |
| `dump_db` | `pg_dump` from source → artifact | `validate` |
| `restore_db` | `pg_restore` / `psql` to destination | `dump_db` |
| `deploy_functions` | Deploys all Edge Functions via Supabase CLI | `validate` |
| `migrate_storage` | Copies all Storage buckets and objects | `validate` |
| `migrate_auth` | Copies all Auth users | `validate` |

Reports are uploaded as workflow artifacts (`migrated_storage.json`,
`migrated_users.json`) and kept for 7 days.

### Auth Migration Limitations

- **Passwords are NOT copied.** Each migrated user receives a cryptographically
  random temporary password. You must send a password-reset email to all
  migrated users after the workflow completes.
- **OAuth identities cannot be migrated** via the Admin API. Users who signed
  in exclusively with Google, GitHub, etc. will need to re-link their provider
  after the migration.
- `created_at` timestamps are set by the server and cannot be preserved.

#### Post-migration checklist

1. Send password-reset emails to all migrated users.
2. Notify users to re-link any OAuth providers (Google, GitHub, etc.).
3. Update application environment variables to point at the destination project.
4. Verify RLS policies and Edge Function secrets in the destination project.
5. Test critical user flows end-to-end in the destination.

### Running Scripts Locally

You can also run the migration scripts from your local machine:

```bash
# Copy and fill in required env vars
cp .env.example .env.local
# Set SRC_* and DST_* vars in .env.local

# Dry-run (no changes made)
DRY_RUN=true SRC_SUPABASE_URL=... SRC_SUPABASE_SERVICE_ROLE_KEY=... \
  DST_SUPABASE_URL=... DST_SUPABASE_SERVICE_ROLE_KEY=... \
  npm run clone:auth

DRY_RUN=true SRC_SUPABASE_URL=... SRC_SUPABASE_SERVICE_ROLE_KEY=... \
  DST_SUPABASE_URL=... DST_SUPABASE_SERVICE_ROLE_KEY=... \
  npm run clone:storage

# DB helper
SRC_DB_HOST=... SRC_DB_PORT=5432 SRC_DB_NAME=postgres \
  SRC_DB_USER=postgres SRC_DB_PASSWORD=... \
  ./scripts/clone_db.sh dump

DST_DB_HOST=... DST_DB_PORT=5432 DST_DB_NAME=postgres \
  DST_DB_USER=postgres DST_DB_PASSWORD=... \
  ./scripts/clone_db.sh restore
```

---

## Development

```bash
npm install
npm run dev      # Start dev server
npm run build    # Production build
npm run test     # Run unit tests
npm run lint     # ESLint
```

