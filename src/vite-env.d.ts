/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_CLERK_PUBLISHABLE_KEY_DEV?: string;
  readonly VITE_DEMO_MODE?: string;
  /** Mixpanel project token (browser; safe to expose) */
  readonly VITE_MIXPANEL_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
