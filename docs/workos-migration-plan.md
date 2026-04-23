# Clerk to WorkOS Migration Plan

This app is not using Clerk only as a frontend auth widget. It is using Clerk as the canonical identity provider across:

- React auth state and protected routes
- session token retrieval for API and Supabase calls
- API bearer token verification via Clerk JWKS
- database ownership and RLS checks where `auth.jwt()->>'sub'` is treated as the app user id
- onboarding/social-link flows wired to Clerk external accounts

Because of that, the migration must be staged. A direct provider swap would break sign-in, API auth, Supabase access, and ownership checks.

## Recommended target

Use WorkOS AuthKit as the auth provider and treat the WorkOS access-token `sub` as the canonical auth user id.

Do not do a big-bang rewrite of every `user_id` value in one release.

Instead:

1. Introduce provider-neutral identity columns and helpers.
2. Make runtime auth verification WorkOS-compatible.
3. Bridge existing Clerk-linked rows to WorkOS users.
4. Remove Clerk-only UI and JWT dependencies after the bridge is stable.

## Why this is necessary

Current coupling discovered in the codebase:

- Frontend provider boot: `src/main.tsx`
- Auth abstraction and Supabase token handoff: `src/hooks/useAuth.tsx`
- Clerk auth UI and routes: `src/pages/Auth.tsx`, `src/pages/SsoCallback.tsx`
- API JWT verification: `api/_clerkFromRequest.ts`, `api/save-profile.ts`
- Owner/workspace access checks: `api/_ownerContextAccess.ts`
- Edge/API callers that explicitly prefer Clerk tokens:
  - `src/lib/invokeEdgeFunction.ts`
  - `src/lib/clerkSessionForEdge.ts`
  - `src/lib/edgeFunctionAuth.ts`
  - `src/lib/submitVcRatingEdge.ts`
  - `src/lib/ensureCompanyWorkspace.ts`
  - `src/lib/completeFounderOnboardingEdge.ts`
- RLS and schema assumptions about JWT `sub`:
  - `supabase/migrations/0001_phase1_identity_workspace_contexts.sql`
  - `supabase/migrations/20260408010000_profiles_anon_upsert_bridge.sql`

## Official WorkOS constraints used for this plan

From official WorkOS docs:

- AuthKit React client-only uses `AuthKitProvider` with `clientId` and `apiHostname`, and exposes `useAuth()` with `user`, `isLoading`, `getAccessToken`, `signIn`, `signUp`, `signOut`.
- WorkOS access tokens are JWTs and should be validated against `https://api.workos.com/sso/jwks/<clientId>`.
- The access token `sub` is the WorkOS user id.

## Migration phases

### Phase 1: decouple app identity from Clerk-specific naming

Goal: make the app depend on an internal auth contract, not Clerk APIs directly.

Tasks:

- Replace Clerk-specific helper names with provider-neutral names:
  - `registerClerkSessionTokenGetter` -> provider-neutral token getter
  - `getClerkSessionToken` / `getClerkBrowserSessionToken` -> provider-neutral access-token helpers
- Split current `useAuth.tsx` into:
  - provider-neutral app auth context
  - provider-specific adapter implementation
- Remove `Clerk` terminology from user-facing error strings and setup hints.

### Phase 2: add WorkOS provider support

Goal: boot the app with WorkOS AuthKit instead of Clerk.

Tasks:

- Add WorkOS React SDK
- Replace `ClerkProvider` in `src/main.tsx` with `AuthKitProvider`
- Replace Clerk key resolution with WorkOS env resolution:
  - `VITE_WORKOS_CLIENT_ID`
  - `VITE_WORKOS_API_HOSTNAME`
  - optional `VITE_WORKOS_DEV_MODE`
- Rebuild `src/hooks/useAuth.tsx` on top of WorkOS `useAuth()`
- Recreate protected-route behavior with WorkOS `signIn({ state: { returnTo } })`

### Phase 3: replace server-side JWT verification

Goal: all API routes accept WorkOS access tokens.

Tasks:

- Replace `api/_clerkFromRequest.ts` with WorkOS JWT verification using WorkOS JWKS
- Update every API route that calls `getClerkUserIdFromAuthHeader`
- Validate `iss`, `aud` if needed, and read `sub` as the WorkOS user id

### Phase 4: database identity bridge

Goal: stop assuming the auth provider id is permanently the same as the legacy Clerk id.

Recommended schema changes:

- Add canonical identity columns to app-owned tables first, especially:
  - `public.users`
  - `public.profiles`
  - `public.owner_contexts`
  - `public.workspace_memberships`
- Suggested columns:
  - `auth_provider text not null default 'clerk'`
  - `auth_user_id text`
  - `legacy_clerk_user_id text`

Recommended approach:

- New WorkOS users write to `auth_user_id`
- Existing rows keep legacy Clerk ids in `legacy_clerk_user_id`
- App lookups transition from `user_id = <jwt sub>` to provider-neutral resolution

This phase should also update RLS policies that currently read:

- `auth.jwt()->>'sub'`

Those policies should compare against the canonical auth identity column, not assume Clerk forever.

### Phase 5: user migration and backfill

Goal: map each Clerk user to a WorkOS user safely.

Recommended data flow:

1. Export current users from Clerk
2. Import/create corresponding users in WorkOS
3. Store the mapping:
   - legacy Clerk id
   - WorkOS user id
   - email
4. Backfill app tables using the mapping
5. Roll out login to WorkOS for internal/test accounts first

Do not rewrite historical ownership rows until the mapping is validated.

### Phase 6: replace Clerk-only features

Goal: remove feature dependencies that only exist because of Clerk.

Known areas:

- `src/pages/Auth.tsx` custom Clerk hosted widgets
- `src/pages/SsoCallback.tsx`
- `src/components/onboarding-wizard/StepIdentity.tsx` external account linking
- `src/components/SettingsPage.tsx` Clerk security/account management surfaces
- `src/lib/clerkSocialLink.ts`
- `src/lib/clerkLocalization.ts`

These need product decisions because WorkOS AuthKit and Clerk external account APIs are not drop-in equivalents.

## Recommended execution order for this repo

1. Build provider-neutral auth helpers and stop spreading Clerk APIs through the app.
2. Add WorkOS provider boot behind env flags.
3. Replace backend JWT verification.
4. Add database bridge columns and identity resolver helpers.
5. Migrate a small internal cohort.
6. Remove Clerk package and dead code.

## What I would do next

If we proceed with the recommended staged migration, the next implementation slice should be:

1. Introduce provider-neutral auth token helpers and rename Clerk-specific helpers.
2. Add a WorkOS-backed auth adapter behind feature flags.
3. Add WorkOS env placeholders to `.env.example`.

That gives us a safe seam for the real provider cutover without forcing a risky DB rewrite first.
