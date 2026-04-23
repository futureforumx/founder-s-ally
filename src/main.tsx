import * as Sentry from "@sentry/react";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { isWorkOSConfigured, readWorkOSConfig } from "@/lib/authProvider";
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

const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";
const workosConfig = readWorkOSConfig();
const workosReady = isWorkOSConfigured();

const appShell = (inner: ReactNode) => (
  <div className="flex min-h-screen flex-col">
    <div className="min-h-0 flex-1">{inner}</div>
  </div>
);

const appTree = workosReady
  ? appShell(
      <AuthKitProvider
        clientId={workosConfig.clientId}
        apiHostname={workosConfig.apiHostname || undefined}
        redirectUri={workosConfig.redirectUri || undefined}
      >
        <App />
      </AuthKitProvider>,
    )
  : (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center">
        <p className="text-sm font-medium text-zinc-900">WorkOS configuration missing</p>
        <p className="max-w-md text-sm text-zinc-600">
          Add <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_WORKOS_CLIENT_ID</code> and either{" "}
          <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_WORKOS_API_HOSTNAME</code> or{" "}
          <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_WORKOS_DEV_MODE=true</code> in your environment.
        </p>
      </div>
    );

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
            Open the browser devtools console for the full stack trace and auth bootstrap details.
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
