import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App";
import "./index.css";

Sentry.init({
  dsn: "https://9fd0ca7c83d4e4b28ab33920b9eb0209@o4511098248888320.ingest.us.sentry.io/4511219409551360",
  environment: import.meta.env.MODE,
  enabled: import.meta.env.PROD,
});

// When running inside Capacitor, redirect /api/* calls to the production server
const apiBase = import.meta.env.VITE_API_BASE;
if (apiBase) {
  const _fetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      return _fetch(`${apiBase}${input}`, init);
    }
    return _fetch(input, init);
  }) as typeof fetch;
}

createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100dvh", fontSize: "14px", color: "#888" }}>Something went wrong. Please refresh.</div>}>
    <App />
  </Sentry.ErrorBoundary>
);
