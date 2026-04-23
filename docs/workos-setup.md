# WorkOS Setup For Vekta

This repo now supports WorkOS AuthKit behind an auth-provider flag.

## What is already wired

- `VITE_AUTH_PROVIDER=workos` switches the frontend auth provider from Clerk to WorkOS.
- `src/main.tsx` mounts `AuthKitProvider`.
- `src/hooks/useAuth.tsx` uses WorkOS access tokens for app auth and Supabase bearer handoff.
- `src/pages/Auth.tsx` renders a WorkOS sign-in / sign-up experience on `/auth` and `/auth/sign-up`.
- `api/_clerkFromRequest.ts` now verifies WorkOS bearer tokens first, then falls back to Clerk.

This is a staged migration, not a full provider cutover. Clerk-based DB identity assumptions still exist in parts of the product.

## Env vars

Set these in `.env.local` for local work and in Vercel for the target environment:

```bash
VITE_AUTH_PROVIDER=workos
VITE_WORKOS_CLIENT_ID=client_...
VITE_WORKOS_REDIRECT_URI=http://localhost:5173/auth

# Recommended if you have a custom auth domain configured in WorkOS
VITE_WORKOS_API_HOSTNAME=auth.vekta.so

# Local/dev fallback when you do not yet have a custom auth domain
# VITE_WORKOS_DEV_MODE=true
```

## WorkOS dashboard settings

Using the official client-only AuthKit flow:

- Redirect URI: `http://localhost:5173/auth` for local
- Redirect URI: `https://www.vekta.so/auth` for production
- Sign-in endpoint: same `/auth` route
- CORS origins: include `http://localhost:5173` and your deployed Vekta domains
- Sign-out redirect: your app homepage

Reference:

- [AuthKit client-only docs](https://workos.com/docs/authkit/client-only)
- [AuthKit sessions docs](https://workos.com/docs/authkit/sessions)

## Important migration note

WorkOS login is now plumbed into the app shell and API bearer verification, but Supabase RLS and legacy ownership rows still assume historical auth IDs in several places. Before making WorkOS the only production provider, finish the identity bridge described in [workos-migration-plan.md](/Users/matthewthompson/VEKTA%20APP/docs/workos-migration-plan.md).
