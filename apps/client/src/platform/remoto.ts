/**
 * Modo servidor. El servidor ejecuta todas las escrituras (emisión, firma, envío a la AEAT) con control
 * de roles; el cliente lee de una réplica de solo lectura de la base de datos (sin usuarios, sesiones ni
 * certificados) que abre con sql.js. Así la interfaz usa el MISMO AstroFactStore en local y en remoto.
 */
import type { SqlJsStatic } from "sql.js";
import { AstroFactStore } from "@astrofact/db";
import { sqljsDriver } from "@astrofact/db/sqljs";
import { pref } from "./storage";

export type Rol = "propietario" | "contable" | "lectura";
export interface UsuarioServidor { id: number; email: string; nombre?: string; rol: Rol; activo: boolean; dosFactores: boolean; }

/** Escrituras que se ejecutan en el servidor (deben coincidir con apps/server/src/rpc.ts). */
const ESCRITURAS = new Set(["exportarDatosTercero", "guardarTercero", "guardarProducto", "archivarProducto", "emitir", "anular", "subsanar", "marcarCobro",
  "verificarIntegridad", "exportarRegistros", "exportarEventos", "crearObligado", "actualizarObligado", "crearSerie", "anonimizarTercero",
  "guardarPlantilla", "guardarCertificado", "generarCertificadoPruebas", "desbloquearCertificado", "activarVerifactu", "envioDetalle",
  "adjuntoDatos", "guardarGasto", "eliminarGasto", "marcarGastoPagado", "anadirAdjunto", "eliminarAdjunto", "guardarDocumento", "cambiarEstadoDocumento",
  "convertirEnAlbaran", "facturarDocumentos", "guardarRecurrencia", "procesarRecurrentes", "registrarCobro", "eliminarCobro", "registrarRecordatorio",
  "importarMovimientos", "conciliar"]);
/** Tareas que en modo servidor hace el propio servidor. */
const DEL_SERVIDOR = new Set(["arranque", "tick", "cierre", "firmarPendientes"]);

const aB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };
const serializar = (v: unknown): unknown => v instanceof Uint8Array ? { $b64: aB64(v) } : Array.isArray(v) ? v.map(serializar)
  : v && typeof v === "object" ? Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, serializar(x)])) : v;
const revivir = (v: unknown): unknown => Array.isArray(v) ? v.map(revivir)
  : v && typeof v === "object" ? ("$b64" in (v as object) ? Uint8Array.from(atob((v as { $b64: string }).$b64), (c) => c.charCodeAt(0)) : Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, revivir(x)]))) : v;

export class ErrorServidor extends Error { constructor(m: string, readonly status: number, readonly incidencias?: { nivel: string; mensaje: string }[]) { super(m); } }

export class ClienteServidor {
  token: string | null;
  /** Si es true, el servidor recuerda la contraseña del certificado (cifrada con su clave maestra) para enviar sin intervención. */
  recordarCertificado = true;
  /** El servidor envía a un simulador de la AEAT (desarrollo/pruebas), no a la AEAT. */
  aeatSimulada = false;
  constructor(readonly base: string) { this.token = sessionStorage.getItem("af:token"); }
  setToken(t: string | null) { this.token = t; try { if (t) sessionStorage.setItem("af:token", t); else sessionStorage.removeItem("af:token"); } catch { /* */ } }

  async api<T>(ruta: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
    const r = await fetch(this.base + ruta, { ...init, headers: { ...(init.json !== undefined ? { "Content-Type": "application/json" } : {}), ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}), ...(init.headers ?? {}) },
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body });
    if (r.status === 401 && this.token && !ruta.startsWith("/api/sesion")) { this.setToken(null); window.dispatchEvent(new Event("af:sesion-caducada")); }
    if (!r.ok) { const e = await r.json().catch(() => ({ error: `Error ${r.status}` })); throw new ErrorServidor(e.error ?? `Error ${r.status}`, r.status, e.incidencias); }
    return (r.status === 204 ? undefined : await r.json()) as T;
  }
  async estado() {
    const e = await this.api<{ instalado: boolean; negocio: boolean; usuario: UsuarioServidor | null; version: string; aeatSimulada?: boolean }>("/api/estado");
    this.aeatSimulada = !!e.aeatSimulada; return e;
  }
  async instalar(email: string, password: string) { const r = await this.api<{ token: string; usuario: UsuarioServidor }>("/api/instalacion", { method: "POST", json: { email, password } }); this.setToken(r.token); return r.usuario; }
  async login(email: string, password: string, codigo?: string) {
    const r = await this.api<{ token?: string; usuario?: UsuarioServidor; requiere2fa?: true }>("/api/sesion", { method: "POST", json: { email, password, codigo } });
    if (r.token) this.setToken(r.token);
    return r;
  }
  async logout() { try { await this.api("/api/sesion", { method: "DELETE" }); } finally { this.setToken(null); } }
  usuarios() { return this.api<UsuarioServidor[]>("/api/usuarios"); }
  crearUsuario(d: { email: string; password: string; rol: Rol; nombre?: string }) { return this.api<UsuarioServidor>("/api/usuarios", { method: "POST", json: d }); }
  actualizarUsuario(id: number, d: { rol?: Rol; activo?: boolean }) { return this.api<UsuarioServidor>(`/api/usuarios/${id}`, { method: "PATCH", json: d }); }
  iniciar2fa() { return this.api<{ secreto: string; uri: string }>("/api/yo/2fa/iniciar", { method: "POST", json: {} }); }
  confirmar2fa(codigo: string) { return this.api("/api/yo/2fa/confirmar", { method: "POST", json: { codigo } }); }
  desactivar2fa(password: string) { return this.api("/api/yo/2fa/desactivar", { method: "POST", json: { password } }); }
  cambiarPassword(actual: string, nueva: string) { return this.api("/api/yo/password", { method: "POST", json: { actual, nueva } }); }
  async rpc(metodo: string, args: unknown[]) {
    const recordar = ["desbloquearCertificado", "guardarCertificado", "generarCertificadoPruebas"].includes(metodo) ? this.recordarCertificado : undefined;
    const r = await this.api<{ resultado: unknown }>(`/api/rpc/${metodo}`, { method: "POST", json: { args: serializar(args), recordar } });
    return revivir(r.resultado);
  }
  /** Descarga la réplica si ha cambiado (304 si no). */
  async sincronizar(rev: string | null): Promise<{ bytes?: Uint8Array; rev: string; desbloqueado: Record<string, boolean> }> {
    const r = await fetch(`${this.base}/api/sincronizar${rev ? `?rev=${rev}` : ""}`, { headers: { Authorization: `Bearer ${this.token}` }, cache: "no-store" });
    if (r.status === 401) { this.setToken(null); window.dispatchEvent(new Event("af:sesion-caducada")); throw new ErrorServidor("Sesión caducada", 401); }
    if (!r.ok && r.status !== 304) throw new ErrorServidor(`No se pudo sincronizar (${r.status})`, r.status);
    const out = { rev: r.headers.get("X-Rev") ?? "0", desbloqueado: JSON.parse(r.headers.get("X-Desbloqueado") ?? "{}") };
    return r.status === 304 ? out : { ...out, bytes: new Uint8Array(await r.arrayBuffer()) };
  }
}

export const urlServidorGuardada = () => pref.get("servidor") ?? "";
export const guardarUrlServidor = (u: string) => pref.set("servidor", u.replace(/\/+$/, ""));

/** Crea el AstroFactStore remoto (lecturas de la réplica; escrituras por RPC) y mantiene la réplica al día. */
export async function crearStoreRemoto(cli: ClienteServidor, SQL: SqlJsStatic, onCambio: () => void) {
  let espejo: AstroFactStore | null = null; let rev: string | null = null; let desbloqueado: Record<string, boolean> = {};
  const sincronizar = async () => {
    const r = await cli.sincronizar(rev);
    desbloqueado = r.desbloqueado;
    if (r.bytes) { espejo = new AstroFactStore(sqljsDriver(SQL, r.bytes)); rev = r.rev; onCambio(); }
    return !!r.bytes;
  };
  await sincronizar();
  const store = new Proxy({} as AstroFactStore, {
    get(_t, prop: string) {
      if (prop === "certificadoDesbloqueado") return (id: number) => !!desbloqueado[String(id)];
      if (DEL_SERVIDOR.has(prop)) return async () => undefined;
      if (ESCRITURAS.has(prop)) return async (...args: unknown[]) => {
        try { return await cli.rpc(prop, args); }
        finally { await sincronizar().catch(() => undefined); onCambio(); }
      };
      const v = (espejo as unknown as Record<string, unknown>)[prop];
      return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(espejo) : v;
    },
  });
  // Cambios de otros usuarios y del envío en segundo plano
  const iv = window.setInterval(() => { void sincronizar().catch(() => undefined); }, 5000);
  return { store, sincronizar, detener: () => window.clearInterval(iv) };
}
