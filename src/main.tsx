import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { readClerkPublishableKey } from "@/lib/clerkPublishableKey";
import { initMixpanel } from "@/lib/mixpanel";

initMixpanel();

Sentry.init({
  dsn: "https://158b3b03e9e65de9964dad4502ae581b@o4511090895749120.ingest.us.sentry.io/4511090900008960",
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const clerkKey = readClerkPublishableKey();
const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";

if (import.meta.env.DEV && clerkKey?.startsWith("pk_live_")) {
  console.warn(
    "[Clerk] pk_live_ on localhost: sign-in may not work. Use pk_test_… in VITE_CLERK_PUBLISHABLE_KEY_DEV for real auth, or use the in-app Preview Mode on /auth."
  );
}

// Always mount the app when a key exists so /auth can show Preview Mode (pk_live + localhost) instead of a blank gate.
const shouldMountClerk = Boolean(clerkKey);

const appTree = shouldMountClerk ? (
  <div className="flex min-h-screen flex-col">
    <div className="min-h-0 flex-1">
      <ClerkProvider publishableKey={clerkKey}>
        <App />
      </ClerkProvider>
    </div>
  </div>
) : (
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
          This build has no <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY</code>. In{" "}
          <strong className="font-medium">Vercel</strong> (or your host) open{" "}
          <strong className="font-medium">Project → Settings → Environment Variables</strong>, add it for{" "}
          <strong className="font-medium">Production</strong> (and Preview if you use previews), then redeploy.
        </>
      )}
    </p>
  </div>
);

if (import.meta.env.DEV && !clerkKey) {
  console.warn(
    "[Clerk] Set VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_… and/or VITE_CLERK_PUBLISHABLE_KEY in .env.local (see .env.example)."
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
