import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isWorkOSConfigured, readAuthProvider, readWorkOSConfig } from "@/lib/authProvider";
import { clerkLocalization } from "@/lib/clerkLocalization";
import { readClerkPublishableKeyWithSource } from "@/lib/clerkPublishableKey";
import { initMixpanel } from "@/lib/mixpanel";
import { applyTheme, readStoredTheme } from "@/lib/theme";

initMixpanel();

if (typeof document !== "undefined") {
  applyTheme(readStoredTheme());
}

/** Off when `VITE_SENTRY_ENABLED=false`. In dev, capture only if `VITE_SENTRY_IN_DEV=true` (avoids 403 noise from ad blockers / domain filters). */
const sentryCaptureEvents =
  import.meta.env.VITE_SENTRY_ENABLED !== "false" &&
  (import.meta.env.PROD || import.meta.env.VITE_SENTRY_IN_DEV === "true");

Sentry.init({
  dsn: "https://158b3b03e9e65de9964dad4502ae581b@o4511090895749120.ingest.us.sentry.io/4511090900008960",
  enabled: sentryCaptureEvents,
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: import.meta.env.PROD ? 0.05 : 0,
});

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const authProvider = readAuthProvider();
const { key: clerkKey, source: clerkKeySource } = readClerkPublishableKeyWithSource();
const workosConfig = readWorkOSConfig();
// Keep WorkOS redirect locked to /auth in every environment to prevent stale callback URIs.
const workosRedirectUri =
  typeof window !== "undefined"
    ? (() => {
        const url = new URL(window.location.href);
        if (url.hostname === "127.0.0.1") {
          url.hostname = "localhost";
        }
        return `${url.origin}/auth`;
      })()
    : (workosConfig.redirectUri || "/auth");
const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";

if (import.meta.env.DEV && clerkKey?.startsWith("pk_live_")) {
  console.warn(
    "[Clerk] pk_live_ on localhost: sign-in may not work. Use pk_test_… in VITE_CLERK_PUBLISHABLE_KEY_DEV for real auth, or use the in-app Preview Mode on /auth."
  );
}

/** Demo mode without a publishable key: skip ClerkProvider; Auth route redirects home (see Auth.tsx). */
const demoWithoutClerk = DEMO_MODE && !clerkKey;
const shouldMountClerk = Boolean(clerkKey);
const shouldMountWorkOS = authProvider === "workos" && isWorkOSConfigured();

const appShell = (inner: ReactNode) => (
  <div className="flex min-h-screen flex-col">
    <div className="min-h-0 flex-1">{inner}</div>
  </div>
);

const appTree = demoWithoutClerk
  ? appShell(<App />)
  : shouldMountWorkOS
    ? appShell(
        <AuthKitProvider
          clientId={workosConfig.clientId}
          apiHostname={workosConfig.apiHostname || undefined}
          redirectUri={workosRedirectUri}
          devMode={workosConfig.devMode}
        >
          <App />
        </AuthKitProvider>,
      )
    : shouldMountClerk
    ? appShell(
        <ClerkProvider publishableKey={clerkKey} localization={clerkLocalization}>
          <App />
        </ClerkProvider>,
      )
    : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#050506] px-6 text-center">
          <p className="text-sm font-medium text-zinc-100">
            {authProvider === "workos" ? "WorkOS config missing" : "Clerk publishable key missing"}
          </p>
          <p className="max-w-md text-sm text-zinc-400">
            {authProvider === "workos" ? (
              <>
                Add <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_WORKOS_CLIENT_ID</code> and either{" "}
                <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_WORKOS_API_HOSTNAME</code> or{" "}
                <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_WORKOS_DEV_MODE=true</code> in your environment, then redeploy.
              </>
            ) : import.meta.env.DEV ? (
              <>
                Add <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_CLERK_PUBLISHABLE_KEY</code> or, for local dev,{" "}
                <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_CLERK_PUBLISHABLE_KEY_DEV</code>{" "}
                (<code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">pk_test_…</code>) in{" "}
                <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">.env.local</code> and restart Vite.
              </>
            ) : (
              <>
                This build has no <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_CLERK_PUBLISHABLE_KEY</code>
                {import.meta.env.VITE_VERCEL_ENV === "preview" ? (
                  <>
                    . For Vercel Preview you can either set that variable for the <strong className="font-medium">Preview</strong> environment, or set{" "}
                    <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">VITE_CLERK_PUBLISHABLE_KEY_PREVIEW</code> (e.g.{" "}
                    <code className="rounded bg-zinc-800/90 px-1.5 py-0.5 font-mono text-xs text-zinc-100">pk_test_…</code>) while Production keeps the live key—then redeploy.
                  </>
                ) : (
                  <>
                    . In <strong className="font-medium">Vercel</strong> (or your host) open{" "}
                    <strong className="font-medium">Project → Settings → Environment Variables</strong>, add it for{" "}
                    <strong className="font-medium">Preview</strong> as well as Production (preview deploys do not inherit Production-only vars), then redeploy.
                  </>
                )}
              </>
            )}
          </p>
          {import.meta.env.DEV && (
            <p className="max-w-md text-xs text-zinc-500">
              Or set <code className="rounded bg-zinc-800/90 px-1 py-0.5 font-mono text-zinc-100">VITE_DEMO_MODE=true</code> in{" "}
              <code className="rounded bg-zinc-800/90 px-1 py-0.5 font-mono text-zinc-100">.env.local</code> to run with a local demo user (no Clerk) until you add a key.
            </p>
          )}
        </div>
      );

if (import.meta.env.DEV && !clerkKey && !DEMO_MODE) {
  console.warn(
    "[Clerk] Set VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_… and/or VITE_CLERK_PUBLISHABLE_KEY in .env.local (see .env.example), or VITE_DEMO_MODE=true for a local demo user."
  );
}

class RootErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error("[RootErrorBoundary]", error, info.componentStack);
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-start gap-3 bg-[#050506] p-8 text-left font-sans">
          <p className="text-sm font-semibold text-zinc-100">The app failed to render</p>
          <pre className="max-h-[40vh] w-full max-w-2xl overflow-auto rounded-md border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-200 shadow-sm">
            {this.state.error.message}
          </pre>
          <p className="text-xs text-zinc-400">
            Open the browser devtools console for the full stack. If you use Clerk on localhost, use Development keys (
            <code className="rounded bg-zinc-800/90 px-1 text-zinc-100">pk_test_…</code>) —{" "}
            <code className="rounded bg-zinc-800/90 px-1 text-zinc-100">pk_live_</code> only works on your production domain.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const inner = sentryEnabled ? (
  <Sentry.ErrorBoundary
    fallback={({ error }) => (
      <div style={{ padding: "24px", fontFamily: "monospace", background: "#050506", minHeight: "100vh" }}>
        <p style={{ fontWeight: "bold", color: "#f4f4f5" }}>An error has occurred</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#fca5a5", fontSize: "13px", marginTop: "8px", background: "#09090b", padding: "12px", borderRadius: "6px", border: "1px solid #27272a" }}>
          {error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}` : String(error)}
        </pre>
      </div>
    )}
  >
    {appTree}
  </Sentry.ErrorBoundary>
) : (
  appTree
);

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>{inner}</RootErrorBoundary>
);
