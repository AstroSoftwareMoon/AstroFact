import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useState } from "react";
import { AlertTriangle, FilePlus2, FileText, Home, KeyRound, Link2, Package, Settings, Users } from "lucide-react";
import { useApp } from "../state/app";
import { Logo, Modal, Campo } from "../ui/kit";

export default function Layout() {
  const app = useApp();
  const { store, obligado: o, t } = app;
  const nav = useNavigate();
  const alarmas = store.alarmasAbiertas(o.id);
  const certOk = store.certificadoDesbloqueado(o.id);
  const cert = store.certificado(o.id);
  const [desb, setDesb] = useState(false);
  const items = [
    { to: "/", icon: Home, label: t("nav.panel"), end: true },
    { to: "/facturas", icon: FileText, label: t("nav.facturas"), end: true },
    { to: "/facturas/nueva", icon: FilePlus2, label: t("nav.nueva") },
    { to: "/clientes", icon: Users, label: t("nav.clientes") },
    { to: "/productos", icon: Package, label: t("nav.productos") },
    { to: "/registro", icon: Link2, label: t("nav.registro") },
    { to: "/ajustes", icon: Settings, label: t("nav.ajustes") },
  ];
  const movil = items.filter((i) => ["/", "/facturas", "/facturas/nueva", "/clientes", "/ajustes"].includes(i.to));
  const link = ({ isActive }: { isActive: boolean }) => `flex items-center gap-3 rounded-2xl px-3 h-10 text-sm transition-all ${isActive ? "bg-glass/[.12] text-fg shadow-glass" : "text-muted hover:text-fg hover:bg-glass/[.06]"}`;
  return (
    <div className="min-h-full flex">
      <aside className="hidden md:flex w-64 shrink-0 flex-col gap-1 p-4 sticky top-0 h-screen">
        <div className="flex items-center gap-2.5 px-2 mb-6 mt-1 text-fg"><Logo size={30} /><span className="text-xl font-semibold tracking-tight">Astro<span className="font-light">Fact</span></span></div>
        <nav className="flex flex-col gap-1">{items.map((i) => <NavLink key={i.to} to={i.to} end={i.end} className={link}><i.icon size={18} />{i.label}</NavLink>)}</nav>
        <div className="mt-auto glass !rounded-2xl p-3 text-xs">
          <div className="font-medium truncate">{o.nombre}</div><div className="text-muted font-mono">{o.nif}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className="chip border-accent/40 text-accent">No VERI*FACTU</span>
            {o.entorno === "pruebas" && <span className="chip border-warn/40 text-warn">PRUEBAS</span>}
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 pb-28 md:pb-10">
        {alarmas.length > 0 && (
          <div role="alert" className="sticky top-0 z-30 m-3 md:m-4 rounded-2xl border border-bad/60 bg-bad/15 backdrop-blur-xl px-4 py-3 flex items-center gap-3 text-sm">
            <AlertTriangle className="text-bad shrink-0" size={18} />
            <span className="flex-1"><b>Alarma de integridad:</b> {alarmas[0]!.mensaje}. No se desactivará hasta que la cadena vuelva a ser íntegra (art. 6.f Orden HAC/1177/2024).</span>
            <button className="btn-ghost h-8" onClick={() => nav("/registro")}>Revisar</button>
          </div>)}
        {cert && !certOk && (
          <div className="mx-3 md:mx-4 mt-3 rounded-2xl border border-warn/50 bg-warn/10 backdrop-blur-xl px-4 py-2.5 flex items-center gap-3 text-sm">
            <KeyRound className="text-warn shrink-0" size={16} /><span className="flex-1">Certificado bloqueado: desbloquéalo para emitir y firmar registros.</span>
            <button className="btn-ghost h-8" onClick={() => setDesb(true)}>Desbloquear</button>
          </div>)}
        {!cert && (
          <div className="mx-3 md:mx-4 mt-3 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-2.5 flex items-center gap-3 text-sm">
            <KeyRound className="text-warn shrink-0" size={16} /><span className="flex-1">Falta el certificado electrónico para firmar los registros.</span>
            <button className="btn-ghost h-8" onClick={() => nav("/ajustes#certificado")}>Configurar</button>
          </div>)}
        <div className="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8"><Outlet /></div>
      </main>
      <nav className="md:hidden fixed bottom-3 inset-x-3 z-40 glass !rounded-3xl px-2 py-2 grid grid-cols-5" style={{ paddingBottom: "max(.5rem, env(safe-area-inset-bottom))" }}>
        {movil.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end} className={({ isActive }) => `flex flex-col items-center gap-1 py-1.5 rounded-2xl text-[11px] transition ${isActive ? "text-fg bg-glass/[.12]" : "text-muted"}`}>
            <i.icon size={20} />{i.label}
          </NavLink>))}
      </nav>
      <DesbloquearCert abierto={desb} onClose={() => setDesb(false)} />
    </div>
  );
}

export function DesbloquearCert({ abierto, onClose }: { abierto: boolean; onClose: () => void }) {
  const { store, obligado: o, toast } = useApp();
  const [pass, setPass] = useState(""); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  return (
    <Modal abierto={abierto} onClose={onClose} titulo="Desbloquear certificado">
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(undefined);
        try { await store.desbloquearCertificado(o.id, pass); toast("Certificado desbloqueado para esta sesión"); setPass(""); onClose(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
        <p className="text-sm text-muted mb-4">La contraseña solo se usa para descifrar el certificado en memoria durante esta sesión; no se guarda.</p>
        <Campo label="Contraseña del certificado" error={err}><input className="input" type="password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} /></Campo>
        <div className="flex justify-end gap-2 mt-5"><button type="button" className="btn-ghost" onClick={onClose}>Cancelar</button><button className="btn-primary" disabled={busy || !pass}>{busy ? "Descifrando…" : "Desbloquear"}</button></div>
      </form>
    </Modal>
  );
}
