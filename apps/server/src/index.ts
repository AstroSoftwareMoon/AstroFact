import { crearServidor } from "./app";

const version = process.env.ASTROFACT_VERSION ?? "dev";
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";
const app = await crearServidor({ webDir: process.env.ASTROFACT_WEB_DIR ?? "./web", version, logger: true });
for (const s of ["SIGINT", "SIGTERM"] as const) process.on(s, () => { void app.close().then(() => process.exit(0)); });
await app.listen({ port, host });
