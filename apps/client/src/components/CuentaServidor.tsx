import { useEffect, useState } from "react";
import { ShieldCheck, UserPlus, Users } from "lucide-react";
import { matrizQr } from "@astrofact/fiscal-core";
import type { Rol, UsuarioServidor } from "../platform/remoto";
import { useApp } from "../state/app";
import { Campo, Chip, Panel } from "../ui/kit";

function QrSimple({ texto }: { texto: string }) {
  const m = matrizQr(texto); const n = m.length; let d = "";
  m.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x} ${y}h1v1h-1z`; }));
  return <svg viewBox={`-2 -2 ${n + 4} ${n + 4}`} className="w-40 h-40 rounded-xl bg-white" shapeRendering="crispEdges" aria-label="Código QR de configuración 2FA"><path d={d} fill="#000" /></svg>;
}

export function MiCuenta() {
  const { cliente, usuario, toast } = useApp();
  const [alta, setAlta] = useState<{ secreto: string; uri: string } | null>(null);
  const [codigo, setCodigo] = useState(""); const [pw, setPw] = useState({ actual: "", nueva: "" });
  if (!cliente || !usuario) return null;
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); } catch (e) { toast((e as Error).message, "error"); } };
  return (
    <Panel>
      <h2 className="font-semibold mb-1 flex items-center gap-2"><ShieldCheck size={18} className="text-accent" />Mi cuenta</h2>
      <p className="text-sm text-muted">{usuario.email} · <Chip tono="acc">{usuario.rol}</Chip></p>
      <h3 className="font-medium mt-5 mb-2 text-sm">Verificación en dos pasos (TOTP)</h3>
      {usuario.dosFactores ? <p className="text-sm text-ok">Activada.</p> : !alta ? (
        <button className="btn-ghost" onClick={() => run(async () => setAlta(await cliente.iniciar2fa()), "Escanea el código con tu app de autenticación")}>Activar 2FA</button>
      ) : (
        <div className="flex flex-wrap gap-4 items-start">
          <QrSimple texto={alta.uri} />
          <div className="space-y-2 text-sm flex-1 min-w-[200px]">
            <p className="text-muted">Escanéalo con Aegis, FreeOTP, Google Authenticator… o introduce la clave:</p>
            <p className="font-mono text-xs break-all">{alta.secreto}</p>
            <input className="input font-mono tracking-[.3em]" maxLength={6} inputMode="numeric" placeholder="123456" value={codigo} onChange={(e) => setCodigo(e.target.value)} />
            <button className="btn-primary" onClick={() => run(async () => { await cliente.confirmar2fa(codigo); setAlta(null); }, "2FA activada: se pedirá al iniciar sesión")}>Confirmar</button>
          </div>
        </div>)}
      <h3 className="font-medium mt-5 mb-2 text-sm">Cambiar contraseña</h3>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
        <input className="input" type="password" placeholder="Actual" value={pw.actual} onChange={(e) => setPw({ ...pw, actual: e.target.value })} autoComplete="current-password" />
        <input className="input" type="password" placeholder="Nueva (mín. 10)" value={pw.nueva} onChange={(e) => setPw({ ...pw, nueva: e.target.value })} autoComplete="new-password" />
        <button className="btn-ghost" disabled={pw.nueva.length < 10} onClick={() => run(() => cliente.cambiarPassword(pw.actual, pw.nueva), "Contraseña cambiada: vuelve a iniciar sesión")}>Cambiar</button>
      </div>
    </Panel>
  );
}

export function GestionUsuarios() {
  const { cliente, usuario, toast } = useApp();
  const [lista, setLista] = useState<UsuarioServidor[]>([]);
  const [n, setN] = useState<{ email: string; password: string; rol: Rol }>({ email: "", password: "", rol: "contable" });
  const cargar = () => { void cliente?.usuarios().then(setLista).catch(() => undefined); };
  useEffect(cargar, [cliente]);
  if (!cliente || usuario?.rol !== "propietario") return null;
  const run = async (fn: () => Promise<unknown>, ok: string) => { try { await fn(); toast(ok); cargar(); } catch (e) { toast((e as Error).message, "error"); } };
  return (
    <Panel>
      <h2 className="font-semibold mb-1 flex items-center gap-2"><Users size={18} className="text-accent" />Usuarios del servidor</h2>
      <p className="text-xs text-muted mb-3">Propietario: todo. Contable: facturar, clientes, productos, exportar. Solo lectura: consultar.</p>
      <ul className="space-y-2 text-sm">{lista.map((u) => (
        <li key={u.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-glass/[.04] border border-line/10 px-3 py-2">
          <span className="flex-1 min-w-0 truncate">{u.email}{u.dosFactores && <ShieldCheck size={13} className="inline ml-1 text-ok" aria-label="2FA" />}</span>
          <select className="input-sm w-36" value={u.rol} onChange={(e) => run(() => cliente.actualizarUsuario(u.id, { rol: e.target.value as Rol }), "Rol actualizado")}><option value="propietario">Propietario</option><option value="contable">Contable</option><option value="lectura">Solo lectura</option></select>
          <button className="btn-ghost h-9 text-xs" onClick={() => run(() => cliente.actualizarUsuario(u.id, { activo: !u.activo }), u.activo ? "Usuario desactivado" : "Usuario activado")}>{u.activo ? "Desactivar" : "Activar"}</button>
        </li>))}</ul>
      <div className="grid sm:grid-cols-[1fr_1fr_140px_auto] gap-2 mt-4">
        <Campo label="Email"><input className="input" type="email" value={n.email} onChange={(e) => setN({ ...n, email: e.target.value })} /></Campo>
        <Campo label="Contraseña inicial"><input className="input" type="password" value={n.password} onChange={(e) => setN({ ...n, password: e.target.value })} autoComplete="new-password" /></Campo>
        <Campo label="Rol"><select className="input" value={n.rol} onChange={(e) => setN({ ...n, rol: e.target.value as Rol })}><option value="contable">Contable</option><option value="lectura">Solo lectura</option><option value="propietario">Propietario</option></select></Campo>
        <div className="flex items-end"><button className="btn-primary" disabled={!n.email || n.password.length < 10} onClick={() => run(async () => { await cliente.crearUsuario(n); setN({ email: "", password: "", rol: "contable" }); }, "Usuario creado")}><UserPlus size={16} /></button></div>
      </div>
    </Panel>
  );
}
