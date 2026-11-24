/**
 * Servidor AstroFact. Principios: los datos son del usuario (solo en su servidor), cero telemetría,
 * cabeceras de seguridad estrictas. Fase 4: sirve la PWA y la comprobación de salud.
 */
import Fastify, { type FastifyInstance } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export interface Config { webDir?: string; version: string; logger?: boolean; }

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

export async function crearServidor(c: Config): Promise<FastifyInstance> {
  const app = Fastify({ logger: c.logger ?? false, trustProxy: true, bodyLimit: 5 * 1024 * 1024 });
  app.addHook("onSend", async (_req, rep, payload) => {
    rep.header("Content-Security-Policy", CSP);
    rep.header("X-Content-Type-Options", "nosniff");
    rep.header("Referrer-Policy", "no-referrer");
    rep.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
    rep.header("Cross-Origin-Opener-Policy", "same-origin");
    rep.header("X-Frame-Options", "DENY");
    return payload;
  });
  app.get("/api/salud", async () => ({ estado: "ok", version: c.version, fase: 4 }));
  const web = c.webDir ? resolve(c.webDir) : undefined;
  if (web && existsSync(web)) {
    await app.register(fastifyStatic, { root: web, index: ["index.html"], cacheControl: false, setHeaders: (res, path) => {
      // El service worker y el HTML nunca se cachean (para que la PWA se actualice); los assets llevan hash.
      res.setHeader("Cache-Control", /(sw\.js|index\.html|\.webmanifest)$/.test(path) ? "no-cache" : "public, max-age=31536000, immutable");
    } });
    app.setNotFoundHandler((req, rep) => (req.url.startsWith("/api/") ? rep.code(404).send({ error: "No encontrado" }) : rep.sendFile("index.html")));
  }
  return app;
}
