/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY_DEV?: string;
  /** Injected at build from `VERCEL_ENV` (see vite.config). Do not set in `.env` for behavior — Vercel sets it. */
  readonly VITE_VERCEL_ENV?: string;
  /** Optional `pk_test_…` used only on Vercel Preview when set (see `resolveClerkPublishableKey`). */
  readonly VITE_CLERK_PUBLISHABLE_KEY_PREVIEW?: string;
  readonly VITE_DEMO_MODE?: string;
  /** Mixpanel project token (browser; safe to expose) */
  readonly VITE_MIXPANEL_TOKEN?: string;
  /** Set to `false` to disable Sentry init and the Sentry error boundary wrapper. */
  readonly VITE_SENTRY_ENABLED?: string;
  /** When `true`, send Sentry events during `vite dev` (default: off in dev to avoid blocked ingest). */
  readonly VITE_SENTRY_IN_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
