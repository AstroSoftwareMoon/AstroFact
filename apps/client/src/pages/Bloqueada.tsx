import { useState } from "react";
import { Lock } from "lucide-react";
import { useApp } from "../state/app";
import { Logo } from "../ui/kit";

export default function Bloqueada() {
  const { desbloquear } = useApp();
  const [p, setP] = useState(""); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form className="glass p-8 w-full max-w-sm animate-rise text-center" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(undefined); try { await desbloquear(p); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
        <div className="flex justify-center text-fg mb-4"><Logo size={44} /></div>
        <h1 className="text-xl font-semibold flex items-center justify-center gap-2"><Lock size={18} />Datos cifrados</h1>
        <p className="text-sm text-muted mt-1">Introduce tu contraseña para abrir AstroFact.</p>
        <input className="input mt-5" type="password" autoFocus value={p} onChange={(e) => setP(e.target.value)} aria-label="Contraseña" />
        {err && <p className="text-sm text-bad mt-2">{err}</p>}
        <button className="btn-primary w-full mt-4" disabled={busy || !p}>{busy ? "Descifrando…" : "Desbloquear"}</button>
      </form>
    </div>
  );
}
