import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { AstroFactStore, MotorVerifactu, PRODUCTOR_POR_DEFECTO, crearCifrador, desempaquetarCifrado, estaCifrado, kdfDeContenedor, type Obligado } from "@astrofact/db";
import { sqljsDriver, type SqlJsDriver } from "@astrofact/db/sqljs";
import { cargarBytes, guardarBytes, pref } from "../platform/storage";
import { ClienteServidor, crearStoreRemoto, guardarUrlServidor, urlServidorGuardada, type UsuarioServidor } from "../platform/remoto";
import { transporteTauri, verifactuLocalDisponible } from "../platform/transporte";
import { textos, type Clave, type Idioma } from "../i18n";

export type Modo = "local" | "servidor";
type Fase = "cargando" | "bloqueada" | "bienvenida" | "login" | "lista" | "error";
interface Toast { id: number; texto: string; tipo: "ok" | "error" | "info"; }
interface Ctx {
  fase: Fase; error?: string; modo: Modo;
  store: AstroFactStore; obligado: Obligado; rev: number;
  t: (k: Clave) => string; idioma: Idioma; setIdioma: (i: Idioma) => void;
  tema: "oscuro" | "claro"; setTema: (t: "oscuro" | "claro") => void;
  cifrada: boolean; activarCifrado: (pass: string) => Promise<void>; desbloquear: (pass: string) => Promise<void>;
  terminarBienvenida: () => Promise<void>; crearStoreNuevo: () => AstroFactStore;
  toast: (texto: string, tipo?: Toast["tipo"]) => void; toasts: Toast[];
  guardarAhora: () => Promise<void>;
  // Modo servidor
  cliente: ClienteServidor | null; usuario: UsuarioServidor | null;
  conectar: (url: string) => Promise<{ instalado: boolean }>;
  entrarServidor: (usuario: UsuarioServidor) => Promise<void>;
  salir: () => Promise<void>; usarLocal: () => Promise<void>;
  puede: (rol: "contable" | "propietario") => boolean;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("Sin contexto"); return c; };
export const useStore = () => { const a = useApp(); return { store: a.store, o: a.obligado, rev: a.rev }; };

let SQL: SqlJsStatic | null = null;
const cargarSql = async () => (SQL ??= await initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<typeof initSqlJs>[0]));
const NIVEL = { lectura: 1, contable: 2, propietario: 3 } as const;

export function AppProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string>();
  const [rev, setRev] = useState(0);
  const [modo, setModo] = useState<Modo>((pref.get("modo") as Modo) ?? "local");
  const [idioma, setIdiomaS] = useState<Idioma>((pref.get("idioma") as Idioma) ?? (navigator.language.startsWith("es") ? "es" : "en"));
  const [tema, setTemaS] = useState<"oscuro" | "claro">((pref.get("tema") as "oscuro" | "claro") ?? "oscuro");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cifrada, setCifrada] = useState(false);
  const [cliente, setCliente] = useState<ClienteServidor | null>(null);
  const [usuario, setUsuario] = useState<UsuarioServidor | null>(null);
  const driverRef = useRef<SqlJsDriver | null>(null);
  const storeRef = useRef<AstroFactStore | null>(null);
  const detenerRemoto = useRef<(() => void) | null>(null);
  const cifradorRef = useRef<Awaited<ReturnType<typeof crearCifrador>> | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => { document.documentElement.classList.toggle("light", tema === "claro"); }, [tema]);
  useEffect(() => { document.documentElement.lang = idioma; }, [idioma]);

  const guardarAhora = useCallback(async () => {
    const d = driverRef.current; if (!d) return;   // en modo servidor no hay nada que guardar localmente
    const bytes = d.exportar();
    await guardarBytes(cifradorRef.current ? await cifradorRef.current.empaquetar(bytes) : bytes);
  }, []);
  const programarGuardado = useCallback(() => {
    setRev((r) => r + 1);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void guardarAhora(); }, 250);
  }, [guardarAhora]);

  /* ---------------- Local ---------------- */
  const montarLocal = useCallback(async (bytes?: Uint8Array) => {
    const sql = await cargarSql();
    const d = sqljsDriver(sql, bytes);
    driverRef.current = d;
    const s = new AstroFactStore(d, { onCambio: programarGuardado, productor: { ...PRODUCTOR_POR_DEFECTO, Version: __APP_VERSION__ } });
    storeRef.current = s;
    const o = s.obligado();
    if (!o) { setFase("bienvenida"); return; }
    s.recuperarEnviosInterrumpidos(o.id);
    await s.arranque(o.id);
    await guardarAhora();
    setFase("lista");
  }, [programarGuardado, guardarAhora]);

  /* ---------------- Servidor ---------------- */
  const montarRemoto = useCallback(async (cli: ClienteServidor) => {
    const sql = await cargarSql();
    detenerRemoto.current?.();
    driverRef.current = null;
    const r = await crearStoreRemoto(cli, sql, () => setRev((x) => x + 1));
    detenerRemoto.current = r.detener;
    storeRef.current = r.store;
    setFase(r.store.obligado() ? "lista" : "bienvenida");
  }, []);

  useEffect(() => {
    (async () => {
      try {
        if (modo === "servidor") {
          const cli = new ClienteServidor(urlServidorGuardada());
          setCliente(cli);
          const e = await cli.estado().catch(() => null);
          if (e?.usuario) { setUsuario(e.usuario); await montarRemoto(cli); } else setFase("login");
          return;
        }
        const bytes = await cargarBytes();
        if (bytes && estaCifrado(bytes)) { setCifrada(true); setFase("bloqueada"); return; }
        await montarLocal(bytes ?? undefined);
      } catch (e) { setError((e as Error).message); setFase("error"); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const caducada = () => { if (modo === "servidor") { detenerRemoto.current?.(); setUsuario(null); setFase("login"); } };
    window.addEventListener("af:sesion-caducada", caducada);
    return () => window.removeEventListener("af:sesion-caducada", caducada);
  }, [modo]);

  // Local: resumen de eventos periódico y al cerrar (art. 9.2) + envío VERI*FACTU (Tauri)
  useEffect(() => {
    if (fase !== "lista" || modo !== "local") return;
    const s = storeRef.current!, id = s.obligado()!.id;
    const motor = verifactuLocalDisponible() ? new MotorVerifactu(s, transporteTauri()) : null;
    const iv = window.setInterval(() => { void s.tick(id); }, 60_000);
    const ivEnvio = window.setInterval(() => { if (motor && s.obligado(id)?.modo === "verifactu") void motor.tick(id).catch(() => undefined); }, 5000);
    const alCerrar = () => { if (document.visibilityState === "hidden") { void s.cierre(id).then(guardarAhora); } };
    document.addEventListener("visibilitychange", alCerrar);
    let quitar: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(async () => { await s.cierre(id); await guardarAhora(); }))
        .then((un) => { quitar = un; }).catch(() => undefined);
    }
    return () => { window.clearInterval(iv); window.clearInterval(ivEnvio); document.removeEventListener("visibilitychange", alCerrar); quitar?.(); };
  }, [fase, modo, guardarAhora]);

  const desbloquear = useCallback(async (pass: string) => {
    const bytes = (await cargarBytes())!;
    const plano = await desempaquetarCifrado(bytes, pass);
    cifradorRef.current = await crearCifrador(pass, kdfDeContenedor(bytes));
    await montarLocal(plano);
  }, [montarLocal]);

  const activarCifrado = useCallback(async (pass: string) => {
    if (pass.length < 8) throw new Error("La contraseña debe tener al menos 8 caracteres");
    cifradorRef.current = await crearCifrador(pass);
    setCifrada(true);
    await guardarAhora();
  }, [guardarAhora]);

  const toast = useCallback((texto: string, tipo: Toast["tipo"] = "ok") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, texto, tipo }]);
    window.setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);

  const conectar = useCallback(async (url: string) => {
    const cli = new ClienteServidor(url.replace(/\/+$/, ""));
    const e = await cli.estado();
    guardarUrlServidor(cli.base); pref.set("modo", "servidor"); setModo("servidor"); setCliente(cli);
    return { instalado: e.instalado };
  }, []);
  const entrarServidor = useCallback(async (u: UsuarioServidor) => { setUsuario(u); await montarRemoto(cliente!); }, [cliente, montarRemoto]);
  const salir = useCallback(async () => { await cliente?.logout().catch(() => undefined); detenerRemoto.current?.(); setUsuario(null); setFase("login"); }, [cliente]);
  const usarLocal = useCallback(async () => {
    detenerRemoto.current?.(); pref.set("modo", "local"); setModo("local"); setCliente(null); setUsuario(null);
    const bytes = await cargarBytes();
    if (bytes && estaCifrado(bytes)) { setCifrada(true); setFase("bloqueada"); return; }
    await montarLocal(bytes ?? undefined);
  }, [montarLocal]);

  const crearStoreNuevo = useCallback(() => storeRef.current!, []);
  const terminarBienvenida = useCallback(async () => {
    const s = storeRef.current!; const o = s.obligado()!;
    await s.arranque(o.id);
    await guardarAhora();
    setFase("lista");
  }, [guardarAhora]);

  const t = useCallback((k: Clave) => textos[idioma][k] ?? k, [idioma]);
  const value = useMemo<Ctx>(() => ({
    fase, error, modo, store: storeRef.current!, obligado: storeRef.current?.obligado() as Obligado, rev, t, idioma,
    setIdioma: (i) => { pref.set("idioma", i); setIdiomaS(i); }, tema, setTema: (x) => { pref.set("tema", x); setTemaS(x); },
    cifrada, activarCifrado, desbloquear, terminarBienvenida, crearStoreNuevo, toast, toasts, guardarAhora,
    cliente, usuario, conectar, entrarServidor, salir, usarLocal,
    puede: (rol) => modo === "local" || (!!usuario && NIVEL[usuario.rol] >= NIVEL[rol]),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fase, error, modo, rev, t, idioma, tema, cifrada, toasts, cliente, usuario]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
