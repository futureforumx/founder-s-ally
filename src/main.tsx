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
import { resolveWorkOSApiHostname, resolveWorkOSClientId, resolveWorkOSDevMode, resolveWorkOSRedirectUri } from "@/lib/workosConfig";

initMixpanel();

if (typeof document !== "undefined") {
  applyTheme(readStoredTheme());
}

// Diagnostic: capture callback URL params BEFORE the SDK cleans them up.
// This runs synchronously at page load, before any React code.
if (typeof window !== "undefined") {
  const sp = new URLSearchParams(window.location.search);
  if (sp.has("code") || sp.has("error")) {
    try {
      sessionStorage.setItem("_wos_callback", JSON.stringify({
        hasCode: sp.has("code"),
        error: sp.get("error"),
        errorDesc: sp.get("error_description"),
        url: window.location.href.slice(0, 200),
        codeVerifier: sessionStorage.getItem("workos:code-verifier") ? "present" : "absent",
        ts: new Date().toISOString(),
      }));
    } catch { /* ignore */ }
  }

  // Intercept window.location.assign to capture the exact WorkOS authorize URL.
  const _origAssign = window.location.assign.bind(window.location);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window.location as any).assign = (url: string | URL) => {
    const urlStr = typeof url === "string" ? url : url.toString();
    if (urlStr.includes("user_management/authorize") || urlStr.includes("workos.com")) {
      try {
        const parsed = new URL(urlStr);
        sessionStorage.setItem("_wos_auth_url", JSON.stringify({
          clientId: parsed.searchParams.get("client_id"),
          redirectUri: parsed.searchParams.get("redirect_uri"),
          hasChallenge: parsed.searchParams.has("code_challenge"),
          ts: new Date().toISOString(),
        }));
        // Also clear old debug data so next attempt is fresh
        sessionStorage.removeItem("_wos_dbg");
        sessionStorage.removeItem("_wos_cb_fired");
        sessionStorage.removeItem("_wos_callback");
      } catch { /* ignore */ }
    }
    return _origAssign(urlStr);
  };
}

// Diagnostic: intercept WorkOS API calls and store results in sessionStorage
// so Auth.tsx can display what actually happened during the code exchange.
if (typeof window !== "undefined") {
  const _origFetch = window.fetch.bind(window);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
    const url =
      typeof args[0] === "string"
        ? args[0]
        : args[0] instanceof URL
        ? args[0].toString()
        : args[0] instanceof Request
        ? args[0].url
        : "";
    if (url.includes("workos.com")) {
      try {
        const res = await _origFetch(...args);
        const clone = res.clone();
        let body = "";
        try { body = (await clone.text()).slice(0, 400); } catch { /* ignore */ }
        const entry = `${new Date().toISOString()} [${res.status}] ${url.replace("https://api.workos.com", "")}\n${body}`;
        try {
          const prev = sessionStorage.getItem("_wos_dbg") ?? "";
          sessionStorage.setItem("_wos_dbg", (prev + "\n---\n" + entry).slice(-3000));
        } catch { /* ignore */ }
        return res;
      } catch (e) {
        const entry = `${new Date().toISOString()} [FETCH_ERR] ${url.replace("https://api.workos.com", "")}\n${String(e)}`;
        try {
          const prev = sessionStorage.getItem("_wos_dbg") ?? "";
          sessionStorage.setItem("_wos_dbg", (prev + "\n---\n" + entry).slice(-3000));
        } catch { /* ignore */ }
        throw e;
      }
    }
    return _origFetch(...args);
  };
}

if (typeof window !== "undefined" && window.location.hostname === "www.vekta.so") {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = "vekta.so";
  window.location.replace(canonicalUrl.toString());
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

const clientId = resolveWorkOSClientId();
const apiHostname = resolveWorkOSApiHostname();
const devMode = resolveWorkOSDevMode();
const redirectUri = resolveWorkOSRedirectUri();
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
  <AuthKitProvider
    clientId={clientId || "unconfigured"}
    apiHostname={apiHostname}
    devMode={devMode}
    redirectUri={redirectUri}
    onRedirectCallback={() => {
      // After successful code exchange, force a hard reload to "/" so the
      // refresh token stored in localStorage (devMode=true) re-authenticates
      // the user without relying on in-memory React state propagation.
      try { sessionStorage.setItem("_wos_cb_fired", new Date().toISOString()); } catch { /* ignore */ }
      window.location.replace("/");
    }}
  >
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
