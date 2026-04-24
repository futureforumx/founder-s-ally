import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  throw new Error("Missing #root element");
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
        <div className="min-h-screen bg-zinc-100 p-8 font-sans text-zinc-900">
          <p className="text-sm font-semibold">The app failed to render</p>
          <pre className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800 shadow-sm">
            {this.state.error.message}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function BootFailure({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-zinc-100 p-8 font-sans text-zinc-900">
      <p className="text-sm font-semibold">Bootstrap failed</p>
      <pre className="mt-3 max-h-[40vh] overflow-auto rounded-md border border-zinc-200 bg-white p-3 text-xs text-zinc-800 shadow-sm">
        {message}
      </pre>
    </div>
  );
}

const root = createRoot(rootEl);

function render(node: ReactNode) {
  root.render(<RootErrorBoundary>{node}</RootErrorBoundary>);
}

async function bootstrapFreshCapital() {
  const [
    { default: FreshCapitalPage },
    { QueryClient, QueryClientProvider },
    { BrowserRouter },
    { TooltipProvider },
    { Toaster },
    { Toaster: Sonner },
  ] = await Promise.all([
    import("./pages/FreshCapitalPage"),
    import("@tanstack/react-query"),
    import("react-router-dom"),
    import("@/components/ui/tooltip"),
    import("@/components/ui/toaster"),
    import("@/components/ui/sonner"),
  ]);

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

  render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <FreshCapitalPage />
        </TooltipProvider>
      </BrowserRouter>
    </QueryClientProvider>,
  );
}

async function bootstrapApp() {
  const [
    Sentry,
    { AuthKitProvider },
    { default: App },
    { initMixpanel },
    { isWorkOSConfigured, readWorkOSConfig },
  ] = await Promise.all([
    import("@sentry/react"),
    import("@workos-inc/authkit-react"),
    import("./App"),
    import("@/lib/mixpanel"),
    import("@/lib/authProvider"),
  ]);

  initMixpanel();

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

  const workosConfig = readWorkOSConfig();
  const workosReady = isWorkOSConfigured();
  const sentryEnabled = import.meta.env.VITE_SENTRY_ENABLED !== "false";

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

  const node = sentryEnabled ? (
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

  render(node);
}

async function bootstrap() {
  const path = window.location.pathname;
  // If WorkOS is redirecting back with an auth code, always use the full app
  // bootstrap so AuthKitProvider can process the callback — even if the redirect
  // URI path happens to be /fresh-capital.
  const hasAuthCode = new URLSearchParams(window.location.search).has("code");
  if (path.startsWith("/fresh-capital") && !hasAuthCode) {
    await bootstrapFreshCapital();
    return;
  }
  await bootstrapApp();
}

bootstrap().catch((error) => {
  const message = error instanceof Error ? `${error.name}: ${error.message}\n\n${error.stack ?? ""}` : String(error);
  console.error("[bootstrap]", error);
  render(<BootFailure message={message} />);
});
