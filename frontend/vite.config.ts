import path from 'path'
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    }, dedupe: ["three"] },
  worker: { format: "es" },
  server: {
    // NOTE: no Content-Security-Policy here — Vite dev needs inline HMR
    // scripts + ws: reconnects that a CSP would block (blank page).
    // Production CSP is sent by the backend secureHeaders() middleware.
    headers: {
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  },
});
