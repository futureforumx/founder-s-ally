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
