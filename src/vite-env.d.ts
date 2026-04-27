/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  /**
   * Optional legacy **anon JWT** (`eyJ…`) from Dashboard → Settings → API.
   * New `sb_publishable_…` keys are not JWTs; Edge Function JWT verification rejects them as Bearer.
   * Set this when using publishable keys + functions that still verify JWT at the gateway.
   */
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY_DEV?: string;
  /** Injected at build from `VERCEL_ENV` (see vite.config). Do not set in `.env` for behavior — Vercel sets it. */
  readonly VITE_VERCEL_ENV?: string;
  /** Optional `pk_test_…` used only on Vercel Preview when set (see `resolveClerkPublishableKey`). */
  readonly VITE_CLERK_PUBLISHABLE_KEY_PREVIEW?: string;
  readonly VITE_WORKOS_CLIENT_ID?: string;
  readonly VITE_WORKOS_API_HOSTNAME?: string;
  readonly VITE_WORKOS_REDIRECT_URI?: string;
  readonly VITE_AUTH_PROVIDER?: string;
  readonly VITE_DEMO_MODE?: string;
  /** Mixpanel project token (browser; safe to expose) */
  readonly VITE_MIXPANEL_TOKEN?: string;
  /** Set to `false` to disable Sentry init and the Sentry error boundary wrapper. */
  readonly VITE_SENTRY_ENABLED?: string;
  /** When `true`, send Sentry events during `vite dev` (default: off in dev to avoid blocked ingest). */
  readonly VITE_SENTRY_IN_DEV?: string;
  /** Optional public headshot CDN base (same as CF_R2_PUBLIC_BASE_HEADSHOTS) so the UI tries those URLs before slow third-party hosts. */
  readonly VITE_HEADSHOT_CDN_BASE?: string;
  /** Full URL to the /access page background MP4 (R2 or any CDN). Overrides {@link VITE_ACCESS_PAGE_VIDEO_CDN_BASE} when set. */
  readonly VITE_ACCESS_PAGE_BG_VIDEO_URL?: string;
  /** Public base URL (no trailing slash) for the access-page background video; file name is fixed in code. */
  readonly VITE_ACCESS_PAGE_VIDEO_CDN_BASE?: string;
  /** Overrides default `https://tryvekta.com/#features` for referrals “See what you’ll get” links. */
  readonly VITE_PRODUCT_FEATURES_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
