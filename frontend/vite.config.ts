import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In development the API runs separately on 3000; in production the backend serves this build.
    proxy: { "/api": { target: "http://localhost:3000", changeOrigin: true } },
  },
  build: { outDir: "dist", sourcemap: false },
});
