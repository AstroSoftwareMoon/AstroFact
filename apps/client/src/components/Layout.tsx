import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AlertTriangle, BarChart3, ClipboardList, FilePlus2, FileText, FileUp, Home, KeyRound, Link2, LogOut, Menu, Package, Receipt, Repeat, Send, Settings, ShieldCheck, Users, Wallet, X } from "lucide-react";
import { useApp } from "../state/app";
import { Logo, Modal, Campo } from "../ui/kit";
import { useAvisoActualizacion } from "./Actualizaciones";

export default function Layout() {
  const app = useApp();
  const { store, obligado: o, t } = app;
  const nav = useNavigate();
  const loc = useLocation();
  const alarmas = store.alarmasAbiertas(o.id);
  const certOk = store.certificadoDesbloqueado(o.id);
  const cert = store.certificado(o.id);
  const [desb, setDesb] = useState(false);
  const [mas, setMas] = useState(false);
  useAvisoActualizacion();
  type Item = { to: string; icon: typeof Home; label: string; end?: boolean; activo?: boolean };
  const grupos: { titulo?: string; items: Item[] }[] = [
    { items: [{ to: "/", icon: Home, label: t("nav.panel"), end: true }] },
    { titulo: "Ventas", items: [
      { to: "/facturas", icon: FileText, label: t("nav.facturas"), end: true },
      { to: "/facturas/nueva", icon: FilePlus2, label: t("nav.nueva") },
      { to: "/documentos/presupuesto", icon: ClipboardList, label: "Presupuestos y albaranes", activo: loc.pathname.startsWith("/documentos") },
      { to: "/recurrentes", icon: Repeat, label: "Recurrentes" },
      { to: "/cobros", icon: Wallet, label: "Cobros e impagos" },
    ] },
    { titulo: "Compras", items: [{ to: "/gastos", icon: Receipt, label: "Gastos" }] },
    { titulo: "Contactos", items: [
      { to: "/clientes", icon: Users, label: t("nav.clientes") },
      { to: "/productos", icon: Package, label: t("nav.productos") },
      { to: "/importar", icon: FileUp, label: "Importar" },
    ] },
    { titulo: "Fiscal", items: [
      { to: "/informes", icon: BarChart3, label: "Informes" },
      ...(o.modo === "verifactu" ? [{ to: "/envios", icon: Send, label: "Envíos AEAT" }] : []),
      ...(o.modo !== "sin_registros" || store.registros(o.id).length ? [{ to: "/registro", icon: Link2, label: t("nav.registro") }] : []),
      { to: "/cumplimiento", icon: ShieldCheck, label: "Cumplimiento" },
    ] },
    { items: [{ to: "/ajustes", icon: Settings, label: t("nav.ajustes") }] },
  ];
  const items = grupos.flatMap((g) => g.items);
  const movil = items.filter((i) => ["/", "/facturas", "/facturas/nueva", "/cobros"].includes(i.to));
  const link = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-2xl px-3 h-10 text-sm transition-all ${isActive ? "bg-glass/[.12] text-fg shadow-glass" : "text-muted hover:text-fg hover:bg-glass/[.06]"}`;
  return (
    <div className="min-h-full flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-6 mt-1 text-fg"><Logo size={30} /><span className="text-xl font-semibold tracking-tight">Astro<span className="font-light">Fact</span></span></div>
        <nav className="flex flex-col gap-0.5 overflow-y-auto -mx-1 px-1">{grupos.map((g, gi) => (
          <div key={gi} className={gi ? "mt-3" : ""}>
            {g.titulo && <div className="px-3 mb-1 text-[10px] uppercase tracking-[.14em] text-muted/70">{g.titulo}</div>}
            {g.items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={(a) => link({ isActive: a.isActive || !!i.activo })}><i.icon size={18} />{i.label}</NavLink>)}
          </div>))}</nav>
        <div className="mt-auto glass !rounded-2xl p-3 text-xs">
          <div className="font-medium truncate">{o.nombre}</div><div className="text-muted font-mono">{o.nif}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip border-accent/40 text-accent">{o.modo === "verifactu" ? "VERI*FACTU" : o.modo === "no_verifactu" ? "No VERI*FACTU" : "Solo facturas"}</span>
            {o.entorno === "pruebas" && <span className="chip border-warn/40 text-warn">PRUEBAS</span>}
          </div>
          {app.modo === "servidor" && app.usuario && (
            <div className="mt-3 pt-3 border-t border-line/10 flex items-center justify-between gap-2">
              <div className="min-w-0"><div className="truncate">{app.usuario.email}</div><div className="text-muted">{app.usuario.rol}</div></div>
              <button className="btn-ghost h-8 w-8 px-0 shrink-0" aria-label="Cerrar sesión" onClick={() => void app.salir()}><LogOut size={14} /></button>
            </div>)}
        </div>
      </aside>
      <main className="flex-1 min-w-0 pb-28 md:pb-10">
        {alarmas.length > 0 && (
          <div role="alert" className="sticky top-0 z-30 m-3 md:m-4 rounded-2xl border border-bad/60 bg-bad/15 backdrop-blur-xl px-4 py-3 flex items-center gap-3 text-sm">
            <AlertTriangle className="text-bad shrink-0" size={18} />
            {alarmas[0]!.tipo.startsWith("aeat")
              ? <span className="flex-1"><b>AEAT:</b> {alarmas[0]!.mensaje}</span>
              : <span className="flex-1"><b>Alarma de integridad:</b> {alarmas[0]!.mensaje}. No se desactivará hasta que la cadena vuelva a ser íntegra (art. 6.f Orden HAC/1177/2024).</span>}
            <button className="btn-ghost h-8" onClick={() => nav(alarmas[0]!.tipo.startsWith("aeat") ? "/envios" : "/registro")}>Revisar</button>
          </div>)}
        {o.modo !== "sin_registros" && cert && !certOk && (
          <div className="mx-3 md:mx-4 mt-3 rounded-2xl border border-warn/50 bg-warn/10 backdrop-blur-xl px-4 py-2.5 flex items-center gap-3 text-sm">
            <KeyRound className="text-warn shrink-0" size={16} /><span className="flex-1">{o.modo === "verifactu" ? "Certificado bloqueado: desbloquéalo para enviar los registros a la AEAT." : "Certificado bloqueado: desbloquéalo para emitir y firmar registros."}</span>
            <button className="btn-ghost h-8" onClick={() => setDesb(true)}>Desbloquear</button>
          </div>)}
        {o.modo !== "sin_registros" && !cert && (
          <div className="mx-3 md:mx-4 mt-3 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-2.5 flex items-center gap-3 text-sm">
            <KeyRound className="text-warn shrink-0" size={16} /><span className="flex-1">Falta el certificado electrónico para firmar los registros.</span>
            <button className="btn-ghost h-8" onClick={() => nav("/ajustes#certificado")}>Configurar</button>
          </div>)}
        <div key={loc.pathname} className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 animate-rise"><Outlet /></div>
      </main>
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 glass !rounded-3xl px-2 py-2 grid grid-cols-5" style={{ paddingBottom: "max(.5rem, env(safe-area-inset-bottom))" }}>
        {movil.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setMas(false)} className={({ isActive }) => `flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[11px] transition ${isActive && !mas ? "text-fg bg-glass/[.12]" : "text-muted"}`}>
            <i.icon size={20} /><span className="truncate max-w-full">{i.to === "/cobros" ? "Cobros" : i.label}</span>
          </NavLink>))}
        <button className={`flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[11px] transition ${mas ? "text-fg bg-glass/[.12]" : "text-muted"}`} onClick={() => setMas((m) => !m)} aria-expanded={mas} aria-label="Más secciones">{mas ? <X size={20} /> : <Menu size={20} />}Más</button>
      </nav>
      {mas && <div className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-sm" onClick={() => setMas(false)}>
        <div className="absolute bottom-24 inset-x-3 glass !rounded-3xl p-3 max-h-[70vh] overflow-y-auto animate-rise" onClick={(e) => e.stopPropagation()}>
          {grupos.filter((g) => g.titulo || g.items[0]!.to === "/ajustes").map((g, gi) => (
            <div key={gi} className={gi ? "mt-3" : ""}>
              {g.titulo && <div className="px-2 mb-1 text-[10px] uppercase tracking-[.14em] text-muted/70">{g.titulo}</div>}
              <div className="grid grid-cols-3 gap-2">{g.items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} onClick={() => setMas(false)} className={({ isActive }) => `flex flex-col items-center text-center gap-1.5 rounded-2xl p-3 text-[11px] leading-tight ${isActive || i.activo ? "bg-glass/[.12] text-fg" : "bg-glass/[.04] text-muted"}`}><i.icon size={20} />{i.label}</NavLink>)}</div>
            </div>))}
        </div>
      </div>}
      <DesbloquearCert abierto={desb} onClose={() => setDesb(false)} />
    </div>
  );
}

export function DesbloquearCert({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  const { store, obligado: o, toast } = useApp();
  const app = useApp();
  const [pass, setPass] = useState(""); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false); const [recordar, setRecordar] = useState(true);
  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Desbloquear certificado">
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(undefined);
        try { if (app.cliente) app.cliente.recordarCertificado = recordar; await store.desbloquearCertificado(o.id, pass); toast("Certificado desbloqueado para esta sesión"); setPass(""); onClose(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
        <p className="text-sm text-muted mb-4">{app.modo === "servidor" ? "La contraseña se envía cifrada (HTTPS) a tu servidor para descifrar allí el certificado." : "La contraseña solo se usa para descifrar el certificado en memoria durante esta sesión; no se guarda."}</p>
        <Campo label="Contraseña del certificado" error={err}><input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} /></Campo>
        {app.modo === "servidor" && <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" className="h-4 w-4" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} />Recordar en el servidor (cifrada con su clave maestra) para trabajar sin intervención</label>}
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !pass}>{busy ? "Descifrando…" : "Desbloquear"}</button></div>
      </form>
    </Modal>
  );
}
