import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";
import { AstroFactStore, PRODUCTOR_POR_DEFECTO, crearCifrador, desempaquetarCifrado, estaCifrado, kdfDeContenedor, type Obligado } from "@astrofact/db";
import { sqljsDriver, type SqlJsDriver } from "@astrofact/db/sqljs";
import { cargarBytes, guardarBytes, pref } from "../platform/storage";
import { textos, type Clave, type Idioma } from "../i18n";

type Fase = "cargando" | "bloqueada" | "bienvenida" | "lista" | "error";
interface Toast { id: number; texto: string; tipo: "ok" | "error" | "info"; }
interface Ctx {
  fase: Fase; error?: string;
  store: AstroFactStore; obligado: Obligado; rev: number;
  t: (k: Clave) => string; idioma: Idioma; setIdioma: (i: Idioma) => void;
  tema: "oscuro" | "claro"; setTema: (t: "oscuro" | "claro") => void;
  cifrada: boolean; activarCifrado: (pass: string) => Promise<void>; desbloquear: (pass: string) => Promise<void>;
  terminarBienvenida: () => Promise<void>; crearStoreNuevo: () => AstroFactStore;
  toast: (texto: string, tipo?: Toast["tipo"]) => void; toasts: Toast[];
  guardarAhora: () => Promise<void>;
}
const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => { const c = useContext(AppCtx); if (!c) throw new Error("Sin contexto"); return c; };
/** Atajos: el contexto solo se usa con fase "lista". */
export const useStore = () => { const a = useApp(); return { store: a.store, o: a.obligado, rev: a.rev }; };

let SQL: SqlJsStatic | null = null;
const cargarSql = async () => (SQL ??= await initSqlJs({ locateFile: () => wasmUrl } as unknown as Parameters<typeof initSqlJs>[0]));

export function AppProvider({ children }: { children: ReactNode }) {
  const [fase, setFase] = useState<Fase>("cargando");
  const [error, setError] = useState<string>();
  const [rev, setRev] = useState(0);
  const [idioma, setIdiomaS] = useState<Idioma>((pref.get("idioma") as Idioma) ?? (navigator.language.startsWith("es") ? "es" : "en"));
  const [tema, setTemaS] = useState<"oscuro" | "claro">((pref.get("tema") as "oscuro" | "claro") ?? "oscuro");
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [cifrada, setCifrada] = useState(false);
  const driverRef = useRef<SqlJsDriver | null>(null);
  const storeRef = useRef<AstroFactStore | null>(null);
  const cifradorRef = useRef<Awaited<ReturnType<typeof crearCifrador>> | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);

  useEffect(() => { document.documentElement.classList.toggle("light", tema === "claro"); }, [tema]);
  useEffect(() => { document.documentElement.lang = idioma; }, [idioma]);

  const guardarAhora = useCallback(async () => {
    const d = driverRef.current; if (!d) return;
    const bytes = d.exportar();
    await guardarBytes(cifradorRef.current ? await cifradorRef.current.empaquetar(bytes) : bytes);
  }, []);
  const programarGuardado = useCallback(() => {
    setRev((r) => r + 1);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void guardarAhora(); }, 250);
  }, [guardarAhora]);

  const montar = useCallback(async (bytes?: Uint8Array) => {
    const sql = await cargarSql();
    const d = sqljsDriver(sql, bytes);
    driverRef.current = d;
    const s = new AstroFactStore(d, { onCambio: programarGuardado, productor: { ...PRODUCTOR_POR_DEFECTO, Version: __APP_VERSION__ } });
    storeRef.current = s;
    const o = s.obligado();
    if (!o) { setFase("bienvenida"); return; }
    await s.arranque(o.id);
    await guardarAhora();
    setFase("lista");
  }, [programarGuardado, guardarAhora]);

  useEffect(() => {
    (async () => {
      try {
        const bytes = await cargarBytes();
        if (bytes && estaCifrado(bytes)) { setCifrada(true); setFase("bloqueada"); return; }
        await montar(bytes ?? undefined);
      } catch (e) { setError((e as Error).message); setFase("error"); }
    })();
  }, [montar]);

  // Resumen de eventos periódico (art. 9.2) y al cerrar/ocultar la app.
  useEffect(() => {
    if (fase !== "lista") return;
    const s = storeRef.current!, id = s.obligado()!.id;
    const iv = window.setInterval(() => { void s.tick(id); }, 60_000);
    const alCerrar = () => { if (document.visibilityState === "hidden") { void s.cierre(id).then(guardarAhora); } };
    document.addEventListener("visibilitychange", alCerrar);
    // Tauri: registro resumen de eventos antes de cerrar la aplicación (art. 9.2 Orden HAC/1177/2024)
    let quitar: (() => void) | undefined;
    if ("__TAURI_INTERNALS__" in window) {
      void import("@tauri-apps/api/window").then(({ getCurrentWindow }) => getCurrentWindow().onCloseRequested(async () => { await s.cierre(id); await guardarAhora(); }))
        .then((un) => { quitar = un; }).catch(() => undefined);
    }
    return () => { window.clearInterval(iv); document.removeEventListener("visibilitychange", alCerrar); quitar?.(); };
  }, [fase, guardarAhora]);

  const desbloquear = useCallback(async (pass: string) => {
    const bytes = (await cargarBytes())!;
    const plano = await desempaquetarCifrado(bytes, pass);
    cifradorRef.current = await crearCifrador(pass, kdfDeContenedor(bytes));
    await montar(plano);
  }, [montar]);

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

  const crearStoreNuevo = useCallback(() => storeRef.current!, []);
  const terminarBienvenida = useCallback(async () => {
    const s = storeRef.current!; const o = s.obligado()!;
    await s.arranque(o.id);
    await guardarAhora();
    setFase("lista");
  }, [guardarAhora]);

  const t = useCallback((k: Clave) => textos[idioma][k] ?? k, [idioma]);
  const value = useMemo<Ctx>(() => ({
    fase, error, store: storeRef.current!, obligado: storeRef.current?.obligado() as Obligado, rev, t, idioma,
    setIdioma: (i) => { pref.set("idioma", i); setIdiomaS(i); }, tema, setTema: (x) => { pref.set("tema", x); setTemaS(x); },
    cifrada, activarCifrado, desbloquear, terminarBienvenida, crearStoreNuevo, toast, toasts, guardarAhora,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [fase, error, rev, t, idioma, tema, cifrada, toasts]);
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}
