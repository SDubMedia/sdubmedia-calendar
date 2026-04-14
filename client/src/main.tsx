import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

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

createRoot(document.getElementById("root")!).render(<App />);
