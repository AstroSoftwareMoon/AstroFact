import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Sin telemetría ni CDNs: todo se sirve desde el propio bundle.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 2500 },
  optimizeDeps: { exclude: ["sql.js"] },
  define: { "process.env": {} },
});
