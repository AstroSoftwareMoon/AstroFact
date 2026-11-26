/**
 * Servidor AstroFact autohospedado. Principios: los datos son del usuario (solo en su servidor),
 * cero telemetría, cabeceras de seguridad estrictas, argon2id + 2FA, roles, rate limiting y auditoría.
 */
import Fastify, { type FastifyRequest } from "fastify";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { AstroFactStore, MotorVerifactu, PRODUCTOR_POR_DEFECTO, type Transporte } from "@astrofact/db";
import { nodeSqlite } from "@astrofact/db/node";
import { transporteNode } from "@astrofact/db/transporte-node";
import { ENDPOINTS } from "@astrofact/fiscal-core";
import { claveMaestra, cifrarTexto, descifrarTexto } from "./seguridad";
import { NIVEL, Usuarios, type Rol, type Usuario } from "./usuarios";
import { ejecutar, rolDe, serializar } from "./rpc";
import { generarReplica } from "./replica";

export interface Config {
  webDir?: string; version: string; logger?: boolean; dataDir: string;
  /** Orígenes permitidos para clientes de escritorio/móvil (Tauri). */
  origenes?: string[];
  /** Solo pruebas/desarrollo: URL del simulador de la AEAT y CA que lo firma. */
  aeatUrl?: string; aeatCa?: string;
  permitirProduccion?: boolean;
  transporte?: Transporte; ahora?: () => Date; intervaloEnvioMs?: number; secreto?: string;
}

const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";

declare module "fastify" { interface FastifyRequest { usuario?: Usuario; token?: string; } }

export async function crearServidor(c: Config): Promise<ReturnType<typeof Fastify> & { store: AstroFactStore; motor: MotorVerifactu; usuarios: Usuarios }> {
  mkdirSync(c.dataDir, { recursive: true });
  const dbPath = join(c.dataDir, "astrofact.db");
  const db = nodeSqlite(dbPath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("CREATE TABLE IF NOT EXISTS secreto (clave TEXT PRIMARY KEY, valor TEXT NOT NULL)");
  const clave = claveMaestra(c.dataDir, c.secreto ?? process.env.ASTROFACT_SECRET);
  let rev = 1;
  const store = new AstroFactStore(db, { ahora: c.ahora, onCambio: () => { rev++; }, productor: { ...PRODUCTOR_POR_DEFECTO, Version: c.version } });
  const usuarios = new Usuarios(db, clave, c.ahora);
  const transporte = c.transporte ?? transporteNode({ ca: c.aeatCa });
  const motor = new MotorVerifactu(store, transporte, { ahora: () => (c.ahora?.() ?? new Date()).getTime(), url: (e) => {
    if (c.aeatUrl) return c.aeatUrl;
    if (e === "produccion" && !c.permitirProduccion) throw new Error("El envío a producción está deshabilitado en este servidor (ASTROFACT_PERMITIR_PRODUCCION=1)");
    return ENDPOINTS[e].verifactu;
  } });

  // Desbloqueo desatendido del certificado (si el propietario lo autorizó), para enviar sin intervención.
  for (const o of store.obligados()) {
    const s = db.get<{ valor: string }>("SELECT valor FROM secreto WHERE clave = ?", [`cert:${o.id}`]);
    if (s) { try { await store.desbloquearCertificado(o.id, descifrarTexto(clave, s.valor)); } catch { /* contraseña cambiada: se pedirá de nuevo */ } }
    store.recuperarEnviosInterrumpidos(o.id);
    await store.arranque(o.id);
  }

  const app = Fastify({ logger: c.logger ?? false, trustProxy: true, bodyLimit: 16 * 1024 * 1024 /* adjuntos de hasta 10 MB en base64 */ });
  await app.register(rateLimit, { global: true, max: 600, timeWindow: "1 minute" });

  app.addHook("onSend", async (req, rep, payload) => {
    rep.header("Content-Security-Policy", CSP);
    rep.header("X-Content-Type-Options", "nosniff");
    rep.header("Referrer-Policy", "no-referrer");
    rep.header("Permissions-Policy", "camera=(), microphone=(), geolocation=(), interest-cohort=()");
    rep.header("X-Frame-Options", "DENY");
    const origen = req.headers.origin;
    if (origen && c.origenes?.includes(origen)) {
      rep.header("Access-Control-Allow-Origin", origen); rep.header("Vary", "Origin");
      rep.header("Access-Control-Allow-Headers", "Authorization, Content-Type"); rep.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      rep.header("Access-Control-Expose-Headers", "X-Rev, X-Desbloqueado");
    }
    return payload;
  });
  app.options("/api/*", async (_q, rep) => rep.code(204).send());

  const tokenDe = (req: FastifyRequest) => (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : undefined);
  const exigir = (rol: Rol) => async (req: FastifyRequest) => {
    const t = tokenDe(req); const u = usuarios.sesion(t);
    if (!u) throw Object.assign(new Error("Sesión no válida o caducada"), { statusCode: 401 });
    if (NIVEL[u.rol] < NIVEL[rol]) throw Object.assign(new Error("No tienes permiso para esta acción"), { statusCode: 403 });
    req.usuario = u; req.token = t;
  };
  app.setErrorHandler((err: Error & { statusCode?: number; incidencias?: unknown; issues?: unknown }, _req, rep) => {
    const code = (err as { statusCode?: number }).statusCode ?? 400;
    rep.code(code >= 400 && code < 600 ? code : 400).send({ error: err.issues ? "Datos no válidos" : err.message, incidencias: err.incidencias });
  });

  app.get("/api/salud", async () => ({ estado: "ok", version: c.version, fase: 6 }));
  app.get("/api/estado", async (req) => ({ instalado: usuarios.hayUsuarios(), negocio: !!store.obligado(), usuario: usuarios.sesion(tokenDe(req)) ?? null, version: c.version, aeatSimulada: !!c.aeatUrl }));

  const Credenciales = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(500), codigo: z.string().max(10).optional(), nombre: z.string().max(120).optional() });
  app.post("/api/instalacion", { config: { rateLimit: { max: 5, timeWindow: "15 minutes" } } }, async (req) => {
    if (usuarios.hayUsuarios()) throw Object.assign(new Error("El servidor ya está configurado"), { statusCode: 409 });
    const b = Credenciales.parse(req.body);
    await usuarios.crear(b.email, b.password, "propietario", b.nombre);
    store.auditar("usuario.instalacion", { email: b.email });
    const r = await usuarios.login(b.email, b.password, undefined, req.ip);
    return r;
  });
  app.post("/api/sesion", { config: { rateLimit: { max: 10, timeWindow: "15 minutes", keyGenerator: (r) => `${r.ip}|${String((r.body as { email?: string })?.email ?? "").toLowerCase()}` } } }, async (req) => {
    const b = Credenciales.parse(req.body);
    try { const r = await usuarios.login(b.email, b.password, b.codigo, req.ip); if ("token" in r) store.auditar("sesion.inicio", { usuario: r.usuario.id, ip: req.ip }); return r; }
    catch (e) { store.auditar("sesion.fallida", { email: b.email, ip: req.ip }); throw Object.assign(e as Error, { statusCode: 401 }); }
  });
  app.delete("/api/sesion", { preHandler: exigir("lectura") }, async (req) => { usuarios.cerrarSesion(req.token!); return { ok: true }; });

  app.get("/api/usuarios", { preHandler: exigir("propietario") }, async () => usuarios.listar());
  const NuevoUsuario = Credenciales.extend({ rol: z.enum(["propietario", "contable", "lectura"]) });
  app.post("/api/usuarios", { preHandler: exigir("propietario") }, async (req) => {
    const b = NuevoUsuario.parse(req.body); const u = await usuarios.crear(b.email, b.password, b.rol, b.nombre);
    store.auditar("usuario.crear", { por: req.usuario!.id, id: u.id, rol: u.rol }); return u;
  });
  app.patch("/api/usuarios/:id", { preHandler: exigir("propietario") }, async (req) => {
    const b = z.object({ rol: z.enum(["propietario", "contable", "lectura"]).optional(), activo: z.boolean().optional(), nombre: z.string().max(120).optional() }).parse(req.body);
    const u = usuarios.actualizar(Number((req.params as { id: string }).id), b);
    store.auditar("usuario.actualizar", { por: req.usuario!.id, id: u.id, ...b }); return u;
  });
  app.post("/api/yo/password", { preHandler: exigir("lectura") }, async (req) => {
    const b = z.object({ actual: z.string(), nueva: z.string().min(10).max(500) }).parse(req.body);
    await usuarios.cambiarPassword(req.usuario!.id, b.actual, b.nueva); return { ok: true };
  });
  app.post("/api/yo/2fa/iniciar", { preHandler: exigir("lectura") }, async (req) => usuarios.iniciar2fa(req.usuario!.id));
  app.post("/api/yo/2fa/confirmar", { preHandler: exigir("lectura") }, async (req) => { usuarios.confirmar2fa(req.usuario!.id, z.object({ codigo: z.string() }).parse(req.body).codigo); store.auditar("2fa.activar", { usuario: req.usuario!.id }); return { ok: true }; });
  app.post("/api/yo/2fa/desactivar", { preHandler: exigir("lectura") }, async (req) => { await usuarios.desactivar2fa(req.usuario!.id, z.object({ password: z.string() }).parse(req.body).password); store.auditar("2fa.desactivar", { usuario: req.usuario!.id }); return { ok: true }; });

  /** Réplica de solo lectura (304 si no hay cambios). */
  app.get("/api/sincronizar", { preHandler: exigir("lectura"), config: { rateLimit: { max: 120, timeWindow: "1 minute" } } }, async (req, rep) => {
    const desbloqueado = Object.fromEntries(store.obligados().map((o) => [o.id, store.certificadoDesbloqueado(o.id)]));
    rep.header("X-Rev", String(rev)).header("X-Desbloqueado", JSON.stringify(desbloqueado)).header("Cache-Control", "no-store");
    if ((req.query as { rev?: string }).rev === String(rev)) return rep.code(304).send();
    return rep.type("application/vnd.sqlite3").send(Buffer.from(generarReplica(dbPath)));
  });

  app.post("/api/rpc/:metodo", { preHandler: async (req) => {
    const m = (req.params as { metodo: string }).metodo;
    const rol = rolDe(m); if (!rol) throw Object.assign(new Error(`Método no permitido: ${m}`), { statusCode: 404 });
    await exigir(rol)(req);
  } }, async (req) => {
    const m = (req.params as { metodo: string }).metodo;
    const { args, recordar } = z.object({ args: z.array(z.unknown()).max(10), recordar: z.boolean().optional() }).parse(req.body);
    const r = await ejecutar(store, m, args);
    if (m === "desbloquearCertificado" || m === "guardarCertificado" || m === "generarCertificadoPruebas") {
      const [oid, a1, a2] = args as [number, unknown, string];
      const pass = m === "desbloquearCertificado" ? (a1 as string) : m === "guardarCertificado" ? a2 : (a1 as string);
      if (recordar) db.run("INSERT INTO secreto (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", [`cert:${oid}`, cifrarTexto(clave, pass)]);
    }
    if (m === "emitir" || m === "anular" || m === "subsanar" || m === "facturarDocumentos" || m === "procesarRecurrentes") setImmediate(() => { void ciclo(); });
    store.auditar(`rpc.${m}`, { usuario: req.usuario!.id });
    return { resultado: serializar(r) };
  });

  // Bucle de envío VERI*FACTU y resumen de eventos
  let ultimoTick = 0;
  const ciclo = async () => {
    for (const o of store.obligados()) {
      try { await motor.tick(o.id); } catch (e) { app.log.error(e); }
      if (Date.now() - ultimoTick > 60_000) {
        try { await store.tick(o.id); } catch (e) { app.log.error(e); }
        try { const r = await store.procesarRecurrentes(o.id); for (const e of r.errores) app.log.warn(e); } catch (e) { app.log.error(e); }
      }
    }
    if (Date.now() - ultimoTick > 60_000) ultimoTick = Date.now();
  };
  const iv = setInterval(() => { void ciclo(); }, c.intervaloEnvioMs ?? 5000);
  app.addHook("onClose", async () => { clearInterval(iv); for (const o of store.obligados()) await store.cierre(o.id); });

  const web = c.webDir ? resolve(c.webDir) : undefined;
  if (web && existsSync(web)) {
    await app.register(fastifyStatic, { root: web, index: ["index.html"], cacheControl: false, setHeaders: (res, path) => {
      res.setHeader("Cache-Control", /(sw\.js|index\.html|\.webmanifest)$/.test(path) ? "no-cache" : "public, max-age=31536000, immutable");
    } });
    app.setNotFoundHandler((req, rep) => (req.url.startsWith("/api/") ? rep.code(404).send({ error: "No encontrado" }) : rep.sendFile("index.html")));
  }
  return Object.assign(app, { store, motor, usuarios });
}

export const leerCa = (f?: string) => (f && existsSync(f) ? readFileSync(f, "utf8") : undefined);
