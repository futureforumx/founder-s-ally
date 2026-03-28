import * as Sentry from "@sentry/react";
import { ClerkProvider } from "@clerk/clerk-react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { readClerkPublishableKey } from "@/lib/clerkPublishableKey";

Sentry.init({
  dsn: "https://158b3b03e9e65de9964dad4502ae581b@o4511090895749120.ingest.us.sentry.io/4511090900008960",
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});

const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";
const clerkKey = readClerkPublishableKey();
const showLiveKeyOnLocalhostWarning =
  import.meta.env.DEV && Boolean(clerkKey?.startsWith("pk_live_"));
const shouldMountClerk = !DEMO_MODE && Boolean(clerkKey) && !showLiveKeyOnLocalhostWarning;

if (import.meta.env.DEV && clerkKey?.startsWith("pk_live_")) {
  console.warn(
    "[Clerk] pk_live_ keys are tied to your production domain and do not work on http://localhost. " +
      "Set VITE_CLERK_PUBLISHABLE_KEY_DEV=pk_test_... in .env.local for local dev."
  );
}

if (import.meta.env.DEV && !DEMO_MODE && !clerkKey) {
  console.warn(
    "[Clerk] Set VITE_CLERK_PUBLISHABLE_KEY and/or VITE_CLERK_PUBLISHABLE_KEY_DEV in .env.local."
  );
}

const appTree = DEMO_MODE ? (
  <App />
) : showLiveKeyOnLocalhostWarning ? (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center">
    <p className="text-sm font-medium text-zinc-900">Clerk key mismatch for localhost</p>
    <p className="max-w-lg text-sm text-zinc-600">
      Use a Development publishable key in VITE_CLERK_PUBLISHABLE_KEY_DEV, then restart Vite.
    </p>
  </div>
) : !clerkKey ? (
  <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-100 px-6 text-center">
    <p className="text-sm font-medium text-zinc-900">Clerk publishable key missing</p>
    <p className="max-w-md text-sm text-zinc-600">
      Add VITE_CLERK_PUBLISHABLE_KEY in your environment variables.
    </p>
  </div>
) : (
  <ClerkProvider publishableKey={clerkKey}>
    <App />
  </ClerkProvider>
);

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary
    fallback={({ error }) => (
      <div style={{ padding: "24px", fontFamily: "monospace" }}>
        <p style={{ fontWeight: "bold", color: "#111" }}>An error has occurred</p>
        <pre style={{ whiteSpace: "pre-wrap", color: "#b00", fontSize: "13px", marginTop: "8px" }}>
          {error instanceof Error ? error.name + ": " + error.message + "\n\n" + (error.stack ?? "") : String(error)}
        </pre>
      </div>
    )}
  >
    {appTree}
  </Sentry.ErrorBoundary>
);
