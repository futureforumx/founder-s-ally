import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const sentryDsn =
  import.meta.env.VITE_SENTRY_DSN ??
  "https://158b3b03e9e65de9964dad4502ae581b@o4511090895749120.ingest.us.sentry.io/4511090900008960";
const sentryEnabled = import.meta.env.PROD && Boolean(sentryDsn);

if (sentryEnabled) {
  Sentry.init({
    dsn: sentryDsn,
    sendDefaultPii: true,
    integrations: [Sentry.browserTracingIntegration()],
    tracesSampleRate: 1.0,
  });
}

/** Trim and strip accidental quotes from .env.local (common copy-paste mistake). */
function readClerkPublishableKey(): string {
  const raw = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
  if (raw == null || typeof raw !== "string") return "";
  return raw.trim().replace(/^["']|["']$/g, "");
}

const clerkKey = readClerkPublishableKey();

const appTree = clerkKey ? (
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
) : (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center">
    <p className="text-sm font-medium text-zinc-900">Clerk publishable key missing</p>
    <p className="max-w-md text-sm text-zinc-600">
      Add <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">VITE_CLERK_PUBLISHABLE_KEY</code>{" "}
      to <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">.env.local</code> and restart Vite.
      See <code className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-mono text-xs">.env.example</code>.
    </p>
  </div>
);

if (import.meta.env.DEV && !clerkKey) {
  console.warn(
    "[Clerk] VITE_CLERK_PUBLISHABLE_KEY is not set. Add it to .env.local (see .env.example)."
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
            Open the browser devtools console for the full stack. If you use Clerk, confirm this origin is allowed in
            the Clerk dashboard (e.g. http://localhost:8080 and http://127.0.0.1:8080).
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

const inner = sentryEnabled ? (
  <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>{appTree}</Sentry.ErrorBoundary>
) : (
  appTree
);

createRoot(document.getElementById("root")!).render(<RootErrorBoundary>{inner}</RootErrorBoundary>);
