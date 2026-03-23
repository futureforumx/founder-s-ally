import * as Sentry from "@sentry/react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

Sentry.init({
  dsn: "https://158b3b03e9e65de9964dad4502ae581b@o4511090895749120.ingest.us.sentry.io/4511090900008960",
  sendDefaultPii: true,
  integrations: [Sentry.browserTracingIntegration()],
  tracesSampleRate: 1.0,
});

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<p>An error has occurred</p>}>
    <App />
  </Sentry.ErrorBoundary>
);
