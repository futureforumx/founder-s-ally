import * as Sentry from "@sentry/react";
import { AuthKitProvider } from "@workos-inc/authkit-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App.tsx";
import PublicApp from "./PublicApp.tsx";
import "./index.css";
import { initMixpanel } from "@/lib/mixpanel";
import { applyTheme, readStoredTheme } from "@/lib/theme";

initMixpanel();

if (typeof document !== "undefined") {
  applyTheme(readStoredTheme());
}

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

const clientId = (import.meta.env.VITE_WORKOS_CLIENT_ID as string) ?? "";
// Derive redirectUri: prefer explicit env var, fall back to origin + /auth/callback.
// The value logged here is what must be registered in the WorkOS Dashboard → Redirects.
const redirectUri =
  (import.meta.env.VITE_WORKOS_REDIRECT_URI as string)?.trim() ||
  `${window.location.origin}/auth/callback`;
const hasWorkOSConfig = Boolean(clientId.trim());
console.log("[WorkOS] clientId present:", hasWorkOSConfig, "| redirectUri:", redirectUri);
const isFreshCapitalPath = /^\/(fresh-capital|fund-watch|freshcapital|fundwatch|newfunds)(\/)?$/i.test(window.location.pathname);
const isToolsPath = /^\/tools(\/.*)?$/i.test(window.location.pathname) || /^\/ai-agents(\/)?$/i.test(window.location.pathname);
const hasAuthCode = new URLSearchParams(window.location.search).has("code");

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
        </div>
      );
    }
    return this.props.children;
  }
}

// Always wrap App in AuthKitProvider so Auth.tsx can safely call useWorkOSAuth().
// AuthProvider inside App uses PublicAuthProvider when clientId is absent, so
// no actual WorkOS API calls are made when the env var is not set.
const appTree = (
  <AuthKitProvider clientId={clientId || "unconfigured"} redirectUri={redirectUri} >
    <App />
  </AuthKitProvider>
);

const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";

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

const root = createRoot(document.getElementById("root")!);

if (isFreshCapitalPath && !hasAuthCode) {
  import("./pages/FreshCapitalPage.tsx").then(({ default: FreshCapitalPage }) => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });

    root.render(
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <FreshCapitalPage />
          </BrowserRouter>
        </QueryClientProvider>
      </RootErrorBoundary>,
    );
  });
} else if (isToolsPath && !hasAuthCode) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 5 * 60 * 1000,
          gcTime: 30 * 60 * 1000,
          retry: 1,
          refetchOnWindowFocus: false,
        },
      },
    });

    root.render(
      <RootErrorBoundary>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <PublicApp />
          </BrowserRouter>
        </QueryClientProvider>
      </RootErrorBoundary>,
    );
} else {
  root.render(
    <RootErrorBoundary>{inner}</RootErrorBoundary>
  );
}
