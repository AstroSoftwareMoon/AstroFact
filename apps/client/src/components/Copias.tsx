import { useState } from "react";
import { DatabaseBackup, Download, ShieldAlert, ShieldCheck, Upload } from "lucide-react";
import type { ManifiestoCopia, VeredictoRestauracion } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Modal, Panel } from "../ui/kit";
import { descargar, pref } from "../platform/storage";
import { fechaHora } from "../format";

/** Días desde la última copia local (undefined si nunca). */
export function diasDesdeCopia(): number | undefined {
  const u = pref.get("ultimaCopia"); if (!u) return undefined;
  return Math.floor((Date.now() - new Date(u).getTime()) / 86_400_000);
}

export function RestaurarCopia({ abierto, onClose, onHecho }: { abierto: boolean; onClose: () => void; onHecho?: () => void }) {
  const app = useApp();
  const [f, setF] = useState<File>(); const [pass, setPass] = useState(""); const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const [an, setAn] = useState<{ manifiesto: ManifiestoCopia; veredicto: VeredictoRestauracion; db: Uint8Array }>();
  const cerrar = () => { setF(undefined); setPass(""); setAn(undefined); setErr(undefined); onClose(); };
  return (
    <Modal abierto={abierto} onClose={cerrar} titulo="Restaurar copia de seguridad">
      {!an ? (
        <form onSubmit={async (e) => { e.preventDefault(); if (!f) return; setBusy(true); setErr(undefined);
          try { setAn(await app.analizarCopia(new Uint8Array(await f.arrayBuffer()), pass)); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>
          <p className="text-sm text-muted mb-4">Elige un fichero <span className="font-mono">.astro</span> y su contraseña. Antes de restaurar comprobamos la integridad de la copia y que no se pierda ningún registro de facturación.</p>
          <Campo label="Fichero de copia"><input className="input pt-2" type="file" accept=".astro" onChange={(e) => setF(e.target.files?.[0])} /></Campo>
          <div className="mt-3"><Campo label="Contraseña de la copia"><input className="input" type="password" value={pass} onChange={(e) => setPass(e.target.value)} /></Campo></div>
          {err && <p className="text-sm text-bad mt-3" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn-ghost" onClick={cerrar}>Cancelar</button><button className="btn-primary" disabled={!f || !pass || busy}>{busy ? "Comprobando…" : "Comprobar copia"}</button></div>
        </form>
      ) : (
        <>
          <div className={`rounded-2xl border p-4 text-sm flex gap-3 ${an.veredicto.permitida ? "border-ok/40 bg-ok/10" : "border-bad/50 bg-bad/10"}`}>
            {an.veredicto.permitida ? <ShieldCheck className="text-ok shrink-0" size={18} /> : <ShieldAlert className="text-bad shrink-0" size={18} />}
            <div><p>{an.veredicto.resumen}</p><p className="text-xs text-muted mt-1">Copia creada el {fechaHora(an.manifiesto.creada)} con la versión {an.manifiesto.version} · {an.veredicto.registrosCopia} registros en la copia, {an.veredicto.registrosActuales} en este equipo.</p></div>
          </div>
          {an.veredicto.permitida && an.veredicto.caso !== "vacio" && <p className="text-sm text-muted mt-3">Los datos actuales de este equipo se sustituirán por los de la copia (gastos, presupuestos, clientes…). La restauración quedará anotada en el registro de eventos.</p>}
          {err && <p className="text-sm text-bad mt-3" role="alert">{err}</p>}
          <div className="flex justify-end gap-2 mt-6"><button className="btn-ghost" onClick={cerrar}>{an.veredicto.permitida ? "Cancelar" : "Cerrar"}</button>
            {an.veredicto.permitida && <button className="btn-primary" disabled={busy} data-testid="confirmar-restauracion" onClick={async () => { setBusy(true); try { await app.restaurarCopia(an.db, an.manifiesto); app.toast("Copia restaurada"); cerrar(); onHecho?.(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); } }}>{busy ? "Restaurando…" : "Restaurar"}</button>}</div>
        </>)}
    </Modal>
  );
}

export default function Copias() {
  const app = useApp();
  const [p, setP] = useState({ a: "", b: "" }); const [busy, setBusy] = useState(false); const [rest, setRest] = useState(false);
  const dias = diasDesdeCopia();
  const servidor = app.modo === "servidor";
  return (
    <Panel id="copias">
      <h2 className="font-semibold mb-1 flex items-center gap-2"><DatabaseBackup size={18} className="text-accent" />Copias de seguridad</h2>
      <p className="text-sm text-muted">{servidor ? "Descarga una copia cifrada de todo el servidor (solo propietarios). Para restaurarla, sigue docs/SERVIDOR.md." : <>Fichero <span className="font-mono">.astro</span> cifrado con su propia contraseña. Guárdalo fuera de este equipo (disco externo, nube…). {dias === undefined ? <b className="text-warn">Aún no has hecho ninguna copia.</b> : <>Última copia hace {dias} {dias === 1 ? "día" : "días"}.</>}</>}</p>
      <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2 mt-3">
        <input type="password" className="input" placeholder="Contraseña de la copia (mín. 8)" aria-label="Contraseña de la copia" value={p.a} onChange={(e) => setP({ ...p, a: e.target.value })} />
        <input type="password" className="input" placeholder="Repetir" aria-label="Repetir contraseña de la copia" value={p.b} onChange={(e) => setP({ ...p, b: e.target.value })} />
        <button className="btn-primary" disabled={busy || p.a.length < 8 || p.a !== p.b || (servidor && !app.puede("propietario"))} onClick={async () => {
          setBusy(true);
          try {
            const bytes = servidor ? await app.cliente!.copia(p.a) : await app.crearCopiaLocal(p.a);
            descargar(`astrofact-${app.obligado.nif}-${new Date().toISOString().slice(0, 10)}.astro`, bytes, "application/octet-stream");
            app.toast("Copia creada: guárdala en un lugar seguro"); setP({ a: "", b: "" });
          } catch (e) { app.toast((e as Error).message, "error"); } finally { setBusy(false); }
        }}><Download size={16} />{busy ? "Creando…" : "Crear copia"}</button>
      </div>
      <p className="text-xs text-muted mt-2">Si pierdes la contraseña, la copia no se puede recuperar. Es independiente de la exportación de registros de facturación (art. 8 Orden HAC/1177/2024).</p>
      {!servidor && <button className="btn-ghost mt-3" onClick={() => setRest(true)}><Upload size={16} />Restaurar una copia…</button>}
      <RestaurarCopia abierto={rest} onClose={() => setRest(false)} />
    </Panel>
  );
}
