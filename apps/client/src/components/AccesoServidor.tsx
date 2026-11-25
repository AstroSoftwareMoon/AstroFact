import { useState } from "react";
import { KeyRound, Server, ShieldCheck } from "lucide-react";
import { useApp } from "../state/app";
import { Campo } from "../ui/kit";

/** Conexión, instalación inicial (primer propietario) e inicio de sesión con 2FA en un servidor AstroFact. */
export default function AccesoServidor({ compacto = false }: { compacto?: boolean }) {
  const app = useApp();
  const mismoOrigen = typeof location !== "undefined" && location.protocol.startsWith("http") ? location.origin : "";
  const [url, setUrl] = useState(app.cliente?.base || mismoOrigen);
  const [paso, setPaso] = useState<"url" | "login" | "instalar">(app.cliente ? "login" : "url");
  const [f, setF] = useState({ email: "", password: "", password2: "", codigo: "" });
  const [pide2fa, setPide2fa] = useState(false);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(undefined); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };

  return (
    <div className="space-y-4">
      {paso === "url" && (<form onSubmit={(e) => { e.preventDefault(); void run(async () => { const r = await app.conectar(url); setPaso(r.instalado ? "login" : "instalar"); }); }}>
        <Campo label="Dirección del servidor" ayuda="p. ej. https://facturas.miempresa.es (tu propio servidor Docker)"><input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" autoFocus required data-testid="url-servidor" /></Campo>
        <button className="btn-primary mt-4 w-full" disabled={busy || !url}><Server size={16} />{busy ? "Conectando…" : "Conectar"}</button>
      </form>)}
      {paso === "instalar" && (<form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        if (f.password !== f.password2) throw new Error("Las contraseñas no coinciden");
        const u = await app.cliente!.instalar(f.email, f.password); await app.entrarServidor(u); }); }}>
        <p className="text-sm text-muted mb-3 flex gap-2"><ShieldCheck size={16} className="text-accent shrink-0 mt-0.5" />Servidor nuevo: crea la cuenta de la persona propietaria. Podrás añadir más usuarios (contable, solo lectura) y activar la verificación en dos pasos.</p>
        <div className="grid gap-3">
          <Campo label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoComplete="username" /></Campo>
          <Campo label="Contraseña (mín. 10)"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required minLength={10} autoComplete="new-password" /></Campo>
          <Campo label="Repite la contraseña"><input className="input" type="password" value={f.password2} onChange={(e) => setF({ ...f, password2: e.target.value })} required autoComplete="new-password" /></Campo>
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy}>{busy ? "Creando…" : "Crear cuenta y entrar"}</button>
      </form>)}
      {paso === "login" && (<form onSubmit={(e) => { e.preventDefault(); void run(async () => {
        const r = await app.cliente!.login(f.email, f.password, pide2fa ? f.codigo : undefined);
        if (r.requiere2fa) { setPide2fa(true); return; }
        await app.entrarServidor(r.usuario!); }); }}>
        {!compacto && <p className="text-sm text-muted mb-3">Servidor: <span className="font-mono text-fg">{app.cliente?.base || url}</span></p>}
        <div className="grid gap-3">
          <Campo label="Email"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required autoFocus autoComplete="username" /></Campo>
          <Campo label="Contraseña"><input className="input" type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required autoComplete="current-password" /></Campo>
          {pide2fa && <Campo label="Código de verificación (app de autenticación)"><input className="input font-mono tracking-[.4em] text-center" inputMode="numeric" maxLength={6} value={f.codigo} onChange={(e) => setF({ ...f, codigo: e.target.value })} autoFocus autoComplete="one-time-code" /></Campo>}
        </div>
        <button className="btn-primary mt-4 w-full" disabled={busy}><KeyRound size={16} />{busy ? "Entrando…" : "Entrar"}</button>
        <button type="button" className="text-xs text-muted mt-3 underline" onClick={() => setPaso("url")}>Cambiar de servidor</button>
      </form>)}
      {err && <p className="text-sm text-bad" role="alert">{err}</p>}
    </div>
  );
}
