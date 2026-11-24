import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";

const VERSION = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")).version as string;

// Cero telemetría ni CDNs: todo se sirve desde el propio bundle.
// PWA (service worker + manifiesto) solo en la compilación web; en Tauri no hace falta.
export default defineConfig(({ mode }) => {
  const tauri = !!process.env.TAURI_ENV_PLATFORM;
  const web = mode === "web" || (!tauri && mode === "production" && process.env.ASTROFACT_PWA === "1");
  return {
    plugins: [
      react(),
      web && VitePWA({
        registerType: "prompt",
        injectRegister: "auto",
        includeAssets: ["favicon.svg", "icons/*.png"],
        workbox: { globPatterns: ["**/*.{js,css,html,svg,png,wasm}"], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024, navigateFallbackDenylist: [/^\/api\//] },
        manifest: {
          name: "AstroFact", short_name: "AstroFact", lang: "es", dir: "ltr",
          description: "Facturación libre para autónomos y pymes de España (VERI*FACTU y No VERI*FACTU). Tus datos en tu dispositivo.",
          theme_color: "#07080d", background_color: "#07080d", display: "standalone", start_url: "./", scope: "./",
          categories: ["business", "finance", "productivity"],
          icons: [
            { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
            { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
            { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          ],
        },
      }),
    ].filter(Boolean),
    base: web ? "./" : "/",
    clearScreen: false,
    server: { port: 5173, strictPort: true },
    envPrefix: ["VITE_", "TAURI_ENV_"],
    build: { target: "es2022", sourcemap: false, chunkSizeWarningLimit: 2500 },
    optimizeDeps: { exclude: ["sql.js"] },
    define: { "process.env": {}, __APP_VERSION__: JSON.stringify(VERSION) },
  };
});
