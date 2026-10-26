import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const target = "http://localhost:8787";

export default defineConfig({
  // Served by the single Worker under /admin/ (API calls stay absolute same-origin: /api/...).
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5174,
    proxy: { "/api": target, "/media": target, "/feeds": target },
  },
  build: { sourcemap: false, chunkSizeWarningLimit: 900 },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    css: false,
  },
});
