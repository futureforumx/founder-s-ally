/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string;
  /** Dev-only: `pk_test_…` from Clerk Development instance; overrides main key when running `vite` */
  readonly VITE_CLERK_PUBLISHABLE_KEY_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
