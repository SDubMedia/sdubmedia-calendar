import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt" so a new deploy shows a one-tap Refresh banner instead of
      // silently serving the stale cached app (we register manually in main.tsx).
      registerType: "prompt",
      injectRegister: false,
      includeAssets: ["pwa-192x192.png", "pwa-512x512.png"],
      manifest: {
        name: "Slate — SDub Media",
        short_name: "Slate",
        description: "Production management platform by SDub Media",
        theme_color: "#0088ff",
        background_color: "#0f172a",
        display: "standalone",
        orientation: "any",
        start_url: "/",
        icons: [
          {
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024, // 5 MB
        globPatterns: ["**/*.{js,css,html,svg,woff2}"],
        navigateFallback: "/index.html",
        // Public routes that recipients might hit before the SW is registered
        // (or while it has a stale cache from a prior deploy). Skip the
        // navigation fallback so they always fetch a fresh index.html from
        // the server, with the current asset hashes. Otherwise a recipient
        // can land on a "loaded" page whose JS bundle 404s — looks exactly
        // like "lost connection."
        navigateFallbackDenylist: [
          /^\/sign\//,       // contract signing
          /^\/deliver\//,    // gallery (token)
          /^\/g\//,          // gallery (slug)
          /^\/proposal\//,   // proposal viewing
          /^\/c\//,          // collection
          /^\/invoice\//,    // public invoice
          /^\/review\/series\//, // series review
          /^\/minis\//,      // mini session sign-up (scanned off a flyer)
          /^\/msb\//,        // a party's own booking page
          /^\/book\//,       // the org's public mini session schedule
          /^\/release\//,    // model release sign-up (client's shared link)
          /^\/api\//,        // never intercept API calls
        ],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "google-fonts-cache", expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: { cacheName: "gstatic-fonts-cache", expiration: { maxEntries: 10, maxAgeSeconds: 365 * 24 * 60 * 60 } },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false,
    host: true,
    // `vite dev` serves the React app but NOT the api/*.ts serverless
    // functions, and `vercel dev` has never worked in this pnpm workspace. So
    // any local page that calls /api (public proposal + mini-session pages,
    // the /api/qr images, Stripe checkout) used to get index.html back and
    // fail in confusing ways — "event isn't available", broken QR images.
    //
    // Forward /api straight to the deployed functions instead. Note this means
    // local pages act on PRODUCTION data — which is already true of the app,
    // since the browser talks to the live Supabase project either way.
    // Override the target with SLATE_API_PROXY when testing a preview deploy.
    proxy: {
      "/api": {
        target: process.env.SLATE_API_PROXY || "https://slate.sdubmedia.com",
        changeOrigin: true,
        secure: true,
        configure: (proxy) => {
          // Unlike Supabase reads (RLS-scoped rows), these routes have real
          // outbound side effects: Stripe checkouts on the connected account,
          // Resend emails to real customers, galleries marked delivered. Say
          // so on every boot rather than letting it be a quiet default.
          const target = process.env.SLATE_API_PROXY || "https://slate.sdubmedia.com";
          console.warn(`\n  ⚠  /api proxied to ${target} — local calls hit LIVE Stripe + email.\n     Set SLATE_API_PROXY to a preview deployment to avoid that.\n`);
          proxy.on("error", (err) => console.warn(`  /api proxy error: ${err.message}`));
        },
      },
    },
  },
});
