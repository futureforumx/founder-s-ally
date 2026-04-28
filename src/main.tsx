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

// ---------------------------------------------------------------------------
// GROUND-TRUTH URL DIAGNOSTIC (runs before React, before AuthKit SDK)
// ---------------------------------------------------------------------------
// This is the earliest possible capture of window.location — before any
// history.replaceState calls, before any React renders, before anything.
// Written to localStorage so it survives across sessions and appears in /debug/auth-proof.
if (typeof window !== "undefined") {
  try {
    const _mainHref = window.location.href;
    const _mainSearch = window.location.search;
    // Only capture on the /auth callback path so we don't overwrite on every page load
    if (window.location.pathname === "/auth" || window.location.pathname === "/auth/") {
      window.localStorage.setItem("_auth_debug_mainjs_href", _mainHref);
      window.localStorage.setItem("_auth_debug_mainjs_search", _mainSearch || "(empty)");
      window.localStorage.setItem("_auth_debug_mainjs_at", new Date().toISOString());
      console.log("[AUTH_PROOF] main.tsx ran on /auth — href:", _mainHref, "search:", _mainSearch);
    }
  } catch { /* ignore */ }
}

// ---------------------------------------------------------------------------
// PKCE codeVerifier recovery
// ---------------------------------------------------------------------------
// Some browsers (Safari ITP) wipe sessionStorage when navigating away via a
// cross-origin redirect and back.  Strategy:
//   1. On every page load, register a `beforeunload` listener that copies the
//      codeVerifier to localStorage right before we leave (safe — no API override).
//   2. On callback page load (?code= present), restore from localStorage if
//      sessionStorage was wiped — this runs synchronously before the SDK reads it.
if (typeof window !== "undefined") {
  // Step 1 — backup on unload (no monkey-patching required)
  window.addEventListener("beforeunload", () => {
    try {
      const cv = sessionStorage.getItem("workos:code-verifier");
      if (cv) {
        localStorage.setItem("_wos_cv_bk", cv);
      }
    } catch { /* ignore */ }
  });

  // Step 2 — restore on callback
  const _cbSp = new URLSearchParams(window.location.search);
  if (_cbSp.has("code") || _cbSp.has("error")) {
    console.log("[auth] callback hit — code present:", _cbSp.has("code"), "error:", _cbSp.get("error"));
    try {
      const CV_KEY = "workos:code-verifier";
      const CV_BACKUP_KEY = "_wos_cv_bk";
      const cvInSession = sessionStorage.getItem(CV_KEY);
      if (!cvInSession) {
        const backup = localStorage.getItem(CV_BACKUP_KEY);
        if (backup) {
          sessionStorage.setItem(CV_KEY, backup);
          console.log("[auth] codeVerifier restored from localStorage backup");
        } else {
          console.warn("[auth] codeVerifier missing from both sessionStorage and localStorage backup");
        }
      } else {
        console.log("[auth] codeVerifier present in sessionStorage");
      }
      localStorage.removeItem(CV_BACKUP_KEY);
    } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// www → apex redirect (safe, uses native replace)
// ---------------------------------------------------------------------------
if (typeof window !== "undefined" && window.location.hostname === "www.vekta.so") {
  const canonicalUrl = new URL(window.location.href);
  canonicalUrl.hostname = "vekta.so";
  window.location.replace(canonicalUrl.toString());
}

// ---------------------------------------------------------------------------
// Sentry
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// WorkOS config (debug — no secrets)
// ---------------------------------------------------------------------------
const clientId = resolveWorkOSClientId();
const apiHostname = resolveWorkOSApiHostname();
const devMode = resolveWorkOSDevMode();
const redirectUri = resolveWorkOSRedirectUri();

console.log("[auth] WorkOS config —", {
  clientIdPresent: Boolean(clientId),
  redirectUri,
  devMode,
  apiHostname: apiHostname ?? "(default api.workos.com)",
});

// ---------------------------------------------------------------------------
// Route detection for public pages
// ---------------------------------------------------------------------------
const isFreshCapitalPath = /^\/(fresh-capital|fund-watch|freshcapital|fundwatch|newfunds)(\/)?$/i.test(window.location.pathname);
const isToolsPath = /^\/tools(\/.*)?$/i.test(window.location.pathname) || /^\/ai-agents(\/)?$/i.test(window.location.pathname);
const hasAuthCode = new URLSearchParams(window.location.search).has("code");

// ---------------------------------------------------------------------------
// Error boundary
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// App tree
// ---------------------------------------------------------------------------
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
      // The SDK has already set the user in its internal React state by the time
      // this fires.  Auth.tsx's useEffect will detect user != null and call
      // navigate("/") via client-side routing — no hard reload needed.
      console.log("[auth] onRedirectCallback fired — SDK exchange complete");
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

// ---------------------------------------------------------------------------
// Root render
// ---------------------------------------------------------------------------
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
