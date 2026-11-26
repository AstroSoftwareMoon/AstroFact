import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { arrancarSimulador, crearPki } from "@astrofact/aeat-sim";
import { crearServidor } from "../src/app";
import { totp } from "../src/seguridad";

const NIF = "89890001K";
let pki: ReturnType<typeof crearPki>;
let sim: Awaited<ReturnType<typeof arrancarSimulador>>;
beforeAll(async () => { pki = crearPki(NIF); sim = await arrancarSimulador({ tls: { ...pki.servidor, ca: pki.caPem }, xsdDir: resolve(__dirname, "../../../docs/normativa/xsd"), tiempoEsperaSeg: 1 }); });
afterAll(async () => { await sim?.cerrar(); });

const dirDatos = () => mkdtempSync(join(tmpdir(), "afsrv-"));
const nuevo = (dataDir = dirDatos(), extra = {}) => crearServidor({ dataDir, version: "9.9.9", aeatUrl: sim.url, aeatCa: pki.caPem, intervaloEnvioMs: 3_600_000, secreto: "x".repeat(40), origenes: ["tauri://localhost"], ...extra });
const auth = (t: string) => ({ authorization: `Bearer ${t}` });
async function instalar(app: Awaited<ReturnType<typeof nuevo>>) {
  const r = await app.inject({ method: "POST", url: "/api/instalacion", payload: { email: "duena@example.com", password: "una-clave-larga-1" } });
  expect(r.statusCode).toBe(200);
  return r.json().token as string;
}
const rpc = (app: Awaited<ReturnType<typeof nuevo>>, t: string, m: string, args: unknown[], extra = {}) => app.inject({ method: "POST", url: `/api/rpc/${m}`, headers: auth(t), payload: { args, ...extra } });

describe("Servidor: seguridad", () => {
  it("salud, PWA, cabeceras y CORS solo para orígenes permitidos", async () => {
    const web = mkdtempSync(join(tmpdir(), "afweb-")); writeFileSync(join(web, "index.html"), "<title>AstroFact</title>"); writeFileSync(join(web, "sw.js"), "//");
    const app = await nuevo(dirDatos(), { webDir: web });
    const s = await app.inject("/api/salud");
    expect(s.json()).toEqual({ estado: "ok", version: "9.9.9", fase: 6 });
    expect(s.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect((await app.inject("/facturas/1")).body).toContain("AstroFact");
    expect((await app.inject("/sw.js")).headers["cache-control"]).toBe("no-cache");
    expect((await app.inject({ url: "/api/salud", headers: { origin: "tauri://localhost" } })).headers["access-control-allow-origin"]).toBe("tauri://localhost");
    expect((await app.inject({ url: "/api/salud", headers: { origin: "https://malo.example" } })).headers["access-control-allow-origin"]).toBeUndefined();
    await app.close();
  });

  it("instalación única, login genérico, rate limiting", async () => {
    const app = await nuevo();
    expect((await app.inject("/api/estado")).json()).toMatchObject({ instalado: false, aeatSimulada: true });
    await instalar(app);
    expect((await app.inject({ method: "POST", url: "/api/instalacion", payload: { email: "otro@example.com", password: "una-clave-larga-2" } })).statusCode).toBe(409);
    const mal = await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "duena@example.com", password: "incorrecta" } });
    expect(mal.statusCode).toBe(401); expect(mal.json().error).toBe("Credenciales incorrectas");
    const noExiste = await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "nadie@example.com", password: "x" } });
    expect(noExiste.json().error).toBe("Credenciales incorrectas");
    let ultimo = 0;
    for (let i = 0; i < 10; i++) ultimo = (await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "duena@example.com", password: "mala" } })).statusCode;
    expect(ultimo).toBe(429);
    expect((await app.inject({ url: "/api/sincronizar" })).statusCode).toBe(401);
    await app.close();
  });

  it("roles: lectura no escribe, contable no configura", async () => {
    const app = await nuevo(); const t = await instalar(app);
    for (const [email, rol] of [["conta@example.com", "contable"], ["ver@example.com", "lectura"]]) expect((await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(t), payload: { email, password: "clave-segura-123", rol } })).statusCode).toBe(200);
    const tok = async (email: string) => (await app.inject({ method: "POST", url: "/api/sesion", payload: { email, password: "clave-segura-123" } })).json().token as string;
    const tc = await tok("conta@example.com"), tl = await tok("ver@example.com");
    expect((await rpc(app, t, "crearObligado", [{ nif: NIF, nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas" }])).statusCode).toBe(200);
    expect((await rpc(app, tc, "crearSerie", [1, { codigo: "B", plantilla: "B{num}", clase: "ordinaria", reinicioAnual: true }])).statusCode).toBe(403);
    expect((await rpc(app, tl, "guardarTercero", [1, { nombre: "X" }])).statusCode).toBe(403);
    expect((await rpc(app, tc, "guardarTercero", [1, { nombre: "Cliente SL", nif: "B12345674" }])).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/sincronizar", headers: auth(tl) })).statusCode).toBe(200);
    expect((await app.inject({ url: "/api/usuarios", headers: auth(tc) })).statusCode).toBe(403);
    for (const m of ["constructor", "__proto__", "toString", "hasOwnProperty", "db"]) expect((await rpc(app, t, m, [])).statusCode).toBe(404);
    // No se puede degradar al último propietario
    expect((await app.inject({ method: "PATCH", url: "/api/usuarios/1", headers: auth(t), payload: { rol: "lectura" } })).statusCode).toBe(400);
    await app.close();
  });

  it("2FA TOTP: activación y login con código", async () => {
    const app = await nuevo(); const t = await instalar(app);
    const { secreto, uri } = (await app.inject({ method: "POST", url: "/api/yo/2fa/iniciar", headers: auth(t) })).json();
    expect(uri).toMatch(/^otpauth:\/\/totp\/AstroFact:/);
    expect((await app.inject({ method: "POST", url: "/api/yo/2fa/confirmar", headers: auth(t), payload: { codigo: "000000" } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: "/api/yo/2fa/confirmar", headers: auth(t), payload: { codigo: totp(secreto) } })).statusCode).toBe(200);
    const sin = await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "duena@example.com", password: "una-clave-larga-1" } });
    expect(sin.json()).toEqual({ requiere2fa: true });
    const con = await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "duena@example.com", password: "una-clave-larga-1", codigo: totp(secreto) } });
    expect(con.json().token).toBeTruthy();
    await app.close();
  });
});

describe("Servidor: VERI*FACTU y réplica", () => {
  it("emite por RPC, envía al simulador con mTLS, réplica sin secretos y reinicio con certificado recordado", async () => {
    const datos = dirDatos();
    let app = await nuevo(datos); const t = await instalar(app);
    expect((await rpc(app, t, "crearObligado", [{ nif: NIF, nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "verifactu", entorno: "pruebas" }])).statusCode).toBe(200);
    await rpc(app, t, "crearSerie", [1, { codigo: "V", plantilla: "V-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true }]);
    const cli = (await rpc(app, t, "guardarTercero", [1, { nombre: "Cliente SL", nif: "B12345674" }])).json().resultado;
    const cert = await rpc(app, t, "guardarCertificado", [1, { $b64: Buffer.from(pki.clienteP12).toString("base64") }, pki.clienteClave], { recordar: true });
    expect(cert.statusCode).toBe(200);
    const em = await rpc(app, t, "emitir", [1, 1, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Servicio", lineas: [{ descripcion: "Hora", cantidad: "1", precioUnitario: "100", tipo: "21" }] }]);
    expect(em.statusCode).toBe(200);
    const f = em.json().resultado;
    expect(f.numSerie).toMatch(/^V-\d{4}-0001$/);
    expect(await app.motor.tick(1)).toMatchObject({ accion: "enviado", aceptados: 1 });
    // Réplica
    const s1 = await app.inject({ url: "/api/sincronizar", headers: auth(t) });
    expect(s1.headers["x-desbloqueado"]).toBe('{"1":true}');
    const f2 = join(dirDatos(), "r.db"); writeFileSync(f2, s1.rawPayload);
    const rdb = new DatabaseSync(f2);
    expect(rdb.prepare("SELECT name FROM sqlite_master WHERE name IN ('usuario','sesion','secreto')").all()).toEqual([]);
    expect(rdb.prepare("SELECT length(p12_cifrado) AS n FROM certificado").get()).toEqual({ n: 0 });
    expect(rdb.prepare("SELECT estado_aeat FROM registro_facturacion").get()).toEqual({ estado_aeat: "aceptado" });
    rdb.close();
    const rev = s1.headers["x-rev"];
    expect((await app.inject({ url: `/api/sincronizar?rev=${rev}`, headers: auth(t) })).statusCode).toBe(304);
    // Error de validación con incidencias
    const malo = await rpc(app, t, "emitir", [1, 1, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "x", lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "12" }] }]);
    expect(malo.statusCode).toBe(400); expect(malo.json().incidencias.length).toBeGreaterThan(0);
    await app.close();
    // Reinicio: el certificado se desbloquea solo (contraseña cifrada con la clave maestra)
    app = await nuevo(datos);
    const t2 = (await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "duena@example.com", password: "una-clave-larga-1" } })).json().token;
    expect((await app.inject({ url: "/api/sincronizar", headers: auth(t2) })).headers["x-desbloqueado"]).toBe('{"1":true}');
    await app.close();
  });

  it("gestión comercial por RPC: gastos con adjunto (fuera de la réplica), roles y lista blanca del cliente", async () => {
    const app = await nuevo(); const t = await instalar(app);
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(t), payload: { email: "ver@example.com", password: "clave-segura-123", rol: "lectura" } });
    const tl = (await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "ver@example.com", password: "clave-segura-123" } })).json().token as string;
    await rpc(app, t, "crearObligado", [{ nif: NIF, nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas" }]);
    const g = await rpc(app, t, "guardarGasto", [1, { proveedorNombre: "Fibra SA", fecha: "2026-01-10", concepto: "Fibra", desglose: [{ base: "100", tipo: "21" }] }]);
    expect(g.statusCode).toBe(200); expect(g.json().resultado.total).toBe("121.00");
    expect((await rpc(app, tl, "guardarGasto", [1, { proveedorNombre: "X", fecha: "2026-01-10", concepto: "X", desglose: [] }])).statusCode).toBe(403);
    const pdf = Buffer.from("%PDF-1.4 " + "x".repeat(2_000_000));
    const a = await rpc(app, t, "anadirAdjunto", [1, "gasto", g.json().resultado.id, { nombre: "f.pdf", mime: "application/pdf", datos: { $b64: pdf.toString("base64") } }]);
    expect(a.statusCode).toBe(200);
    // La réplica no lleva los bytes de los adjuntos; se piden bajo demanda (también con rol lectura)
    const s1 = await app.inject({ url: "/api/sincronizar", headers: auth(tl) });
    expect(s1.rawPayload.length).toBeLessThan(1_000_000);
    const d = await rpc(app, tl, "adjuntoDatos", [a.json().resultado.id]);
    expect(Buffer.from(d.json().resultado.datos.$b64, "base64").equals(pdf)).toBe(true);
    await app.close();
  });

  it("los métodos de escritura del cliente remoto coinciden con la lista blanca del servidor", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(resolve(__dirname, "../../client/src/platform/remoto.ts"), "utf8");
    const lista = [...src.match(/const ESCRITURAS = new Set\(\[([\s\S]*?)\]\)/)![1]!.matchAll(/"(\w+)"/g)].map((m) => m[1]!).sort();
    const { METODOS } = await import("../src/rpc");
    expect(lista).toEqual(Object.keys(METODOS).sort());
  });

  it("copia .astro solo para el propietario y restauración que no pierde registros", async () => {
    const datos = dirDatos();
    const app = await nuevo(datos); const t = await instalar(app);
    await rpc(app, t, "crearObligado", [{ nif: NIF, nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas" }]);
    await app.inject({ method: "POST", url: "/api/usuarios", headers: auth(t), payload: { email: "conta@example.com", password: "clave-segura-123", rol: "contable" } });
    const tc = (await app.inject({ method: "POST", url: "/api/sesion", payload: { email: "conta@example.com", password: "clave-segura-123" } })).json().token as string;
    expect((await app.inject({ method: "POST", url: "/api/copia", headers: auth(tc), payload: { password: "clave-de-copia" } })).statusCode).toBe(403);
    const r = await app.inject({ method: "POST", url: "/api/copia", headers: auth(t), payload: { password: "clave-de-copia" } });
    expect(r.statusCode).toBe(200);
    const { esCopiaAstro, leerCopia } = await import("@astrofact/db");
    expect(esCopiaAstro(new Uint8Array(r.rawPayload))).toBe(true);
    const f = join(dirDatos(), "s.astro"); writeFileSync(f, r.rawPayload);
    await app.close();
    const db = (await leerCopia(new Uint8Array(r.rawPayload), "clave-de-copia")).db;
    const rdb = join(dirDatos(), "c.db"); writeFileSync(rdb, db);
    const c = new DatabaseSync(rdb); expect(c.prepare("SELECT COUNT(*) AS n FROM sesion").get()).toEqual({ n: 0 }); expect(c.prepare("SELECT COUNT(*) AS n FROM usuario").get()).toEqual({ n: 2 }); c.close();
    const { restaurar } = await import("../src/restaurar");
    await expect(restaurar(f, datos, "mala-clave-123")).rejects.toThrow(/Contraseña/);
    await restaurar(f, datos, "clave-de-copia");
    const tras = new DatabaseSync(join(datos, "astrofact.db"));
    expect(tras.prepare("SELECT tipo FROM registro_evento ORDER BY id DESC LIMIT 1").get()).toEqual({ tipo: "07" });
    tras.close();
  });

  it("producción bloqueada salvo autorización explícita", async () => {
    const app = await crearServidor({ dataDir: dirDatos(), version: "x", secreto: "y".repeat(40), intervaloEnvioMs: 3_600_000 });
    const t = await instalar(app as any);
    await rpc(app as any, t, "crearObligado", [{ nif: NIF, nombre: "E SL", territorio: "peninsula", modo: "verifactu", entorno: "produccion" }]);
    await rpc(app as any, t, "crearSerie", [1, { codigo: "V", plantilla: "V{num}", clase: "ordinaria", reinicioAnual: true }]);
    await rpc(app as any, t, "guardarCertificado", [1, { $b64: Buffer.from(pki.clienteP12).toString("base64") }, pki.clienteClave]);
    const cli = (await rpc(app as any, t, "guardarTercero", [1, { nombre: "C", nif: "B12345674" }])).json().resultado;
    await rpc(app as any, t, "emitir", [1, 1, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "S", lineas: [{ descripcion: "a", cantidad: "1", precioUnitario: "1", tipo: "21" }] }]);
    expect(await app.motor.tick(1)).toMatchObject({ accion: "bloqueado", motivo: "configuracion", mensaje: expect.stringMatching(/producción está deshabilitado/) });
    await app.close();
  });
});
