import { crearServidor, leerCa } from "./app";

const app = await crearServidor({
  version: process.env.ASTROFACT_VERSION ?? "dev",
  webDir: process.env.ASTROFACT_WEB_DIR ?? "./web",
  dataDir: process.env.ASTROFACT_DATA_DIR ?? "./datos",
  origenes: (process.env.ASTROFACT_ORIGENES ?? "tauri://localhost,http://tauri.localhost,https://tauri.localhost").split(",").map((s) => s.trim()).filter(Boolean),
  aeatUrl: process.env.ASTROFACT_AEAT_URL, aeatCa: leerCa(process.env.ASTROFACT_AEAT_CA),
  permitirProduccion: process.env.ASTROFACT_PERMITIR_PRODUCCION === "1",
  logger: true,
});
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => { void app.close().then(() => process.exit(0)); });
await app.listen({ port: Number(process.env.PORT ?? 8080), host: process.env.HOST ?? "0.0.0.0" });
