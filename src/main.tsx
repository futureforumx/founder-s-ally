import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { clerkLocalization } from "@/lib/clerkLocalization";
import { readClerkPublishableKeyWithSource } from "@/lib/clerkPublishableKey";
import { initMixpanel } from "@/lib/mixpanel";

initMixpanel();

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
const { key: clerkKey, source: clerkKeySource } = readClerkPublishableKeyWithSource();
const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";

// #region agent log
if (import.meta.env.DEV) {
  const pk = clerkKey;
  const keyKind = !pk ? "empty" : pk.startsWith("pk_live_") ? "live" : pk.startsWith("pk_test_") ? "test" : "other";
  fetch("http://127.0.0.1:7495/ingest/6fb0ce79-c45e-47a9-a25c-e1e40763a812", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "4b2f23" },
    body: JSON.stringify({
      sessionId: "4b2f23",
      location: "main.tsx:clerk",
      message: "clerk key resolution",
      data: {
        source: clerkKeySource,
        hasKey: Boolean(pk),
        keyKind,
        vercelEnv: String(import.meta.env.VITE_VERCEL_ENV ?? ""),
        prod: import.meta.env.PROD,
      },
      timestamp: Date.now(),
      hypothesisId: "H-PREVIEW-KEY",
      runId: "key-resolution",
    }),
  }).catch(() => {});
}
// #endregion

if (import.meta.env.DEV && clerkKey?.startsWith("pk_live_")) {
  console.warn(
    "[Clerk] pk_live_ on localhost: sign-in may not work. Use pk_test_… in VITE_CLERK_PUBLISHABLE_KEY_DEV for real auth, or use the in-app Preview Mode on /auth."
  );
}

/** Demo mode without a publishable key: skip ClerkProvider; Auth route redirects home (see Auth.tsx). */
const demoWithoutClerk = DEMO_MODE && !clerkKey;
const shouldMountClerk = Boolean(clerkKey);

const appShell = (inner: ReactNode) => (
  <div className="flex min-h-screen flex-col">
    <div className="min-h-0 flex-1">{inner}</div>
  </div>
);

const appTree = demoWithoutClerk
  ? appShell(<App />)
  : shouldMountClerk
    ? appShell(
        <ClerkProvider publishableKey={clerkKey} localization={clerkLocalization}>
          <App />
        </ClerkProvider>,
      )
    : (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center">
          <p className="text-sm font-medium text-zinc-900">Clerk publishable key missing</p>
          <p className="max-w-md text-sm text-zinc-600">
            {import.meta.env.DEV ? (
              <>
                Add <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY</code> or, for local dev,{" "}
                <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_DEV</code>{" "}
                (<code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">pk_test_…</code>) in{" "}
                <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">.env.local</code> and restart Vite.
              </>
            ) : (
              <>
                This build has no <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY</code>
                {import.meta.env.VITE_VERCEL_ENV === "preview" ? (
                  <>
                    . For Vercel Preview you can either set that variable for the <strong className="font-medium">Preview</strong> environment, or set{" "}
                    <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY_PREVIEW</code> (e.g.{" "}
                    <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">pk_test_…</code>) while Production keeps the live key—then redeploy.
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
              Or set <code className="rounded bg-zinc-200/80 px-1 py-0.5 font-mono">VITE_DEMO_MODE=true</code> in{" "}
              <code className="rounded bg-zinc-200/80 px-1 py-0.5 font-mono">.env.local</code> to run with a local demo user (no Clerk) until you add a key.
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
        <div className="flex min-h-screen flex-col items-start gap-3 bg-zinc-100 p-8 text-left font-sans">
          <p className="text-sm font-semibold text-zinc-900">The app failed to render</p>
          <pre className="max-h-[40vh] w-full max-w-2xl overflow-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800 shadow-sm">
            {this.state.error.message}
          </pre>
          <p className="text-xs text-zinc-600">
            Open the browser devtools console for the full stack. If you use Clerk on localhost, use Development keys (
            <code className="rounded bg-zinc-200/80 px-1">pk_test_…</code>) —{" "}
            <code className="rounded bg-zinc-200/80 px-1">pk_live_</code> only works on your production domain.
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
      <div style={{ padding: "24px", fontFamily: "monospace", background: "#fafafa", minHeight: "100vh" }}>
        <p style={{ fontWeight: "bold", color: "#111" }}>An error has occurred</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#b00", fontSize: "13px", marginTop: "8px", background: "#fff", padding: "12px", borderRadius: "6px", border: "1px solid #eee" }}>
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
