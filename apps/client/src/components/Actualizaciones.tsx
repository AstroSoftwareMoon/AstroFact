import { useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { useApp } from "../state/app";
import { Panel } from "../ui/kit";
import { actualizadorDisponible, autoActualizar, buscarActualizacion, enTauri, setAutoActualizar, VERSION, type Novedad } from "../platform/actualizaciones";

/** Comprobación al arrancar (si está activada): avisa con un toast, nunca instala sola. */
export function useAvisoActualizacion() {
  const { toast } = useApp();
  useEffect(() => {
    if (!actualizadorDisponible() || !autoActualizar()) return;
    const t = window.setTimeout(() => { buscarActualizacion().then((n) => n && toast(`Nueva versión ${n.version} disponible: instálala desde Ajustes`, "info")).catch(() => undefined); }, 4000);
    return () => window.clearTimeout(t);
  }, [toast]);
}

export default function Actualizaciones() {
  const { toast } = useApp();
  const [auto, setAuto] = useState(autoActualizar());
  const [nov, setNov] = useState<Novedad | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [pct, setPct] = useState<number>();
  return (
    <Panel>
      <h2 className="font-semibold mb-1 flex items-center gap-2"><RefreshCw size={18} className="text-accent" />Actualizaciones</h2>
      <p className="text-sm text-muted">Versión instalada <span className="font-mono text-fg">{VERSION}</span>.</p>
      {!enTauri() ? <p className="text-sm text-muted mt-2">En la versión web (PWA) las actualizaciones llegan al recargar la página.</p>
        : !actualizadorDisponible() ? <p className="text-sm text-muted mt-2">Esta compilación no incluye actualizaciones firmadas (compilación local o sin clave de firma). Descarga las nuevas versiones desde GitHub.</p>
        : (<>
          <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" className="h-4 w-4" checked={auto} onChange={(e) => { setAuto(e.target.checked); setAutoActualizar(e.target.checked); }} />Buscar actualizaciones al abrir la app</label>
          <p className="text-xs text-muted mt-1">Solo se consulta GitHub Releases; no se envía ningún dato tuyo. Cada actualización va firmada y se verifica antes de instalarse.</p>
          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); try { setNov(await buscarActualizacion()); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } }}><RefreshCw size={16} />Buscar ahora</button>
            {nov === null && <span className="text-sm text-ok">Tienes la última versión.</span>}
          </div>
          {nov && <div className="mt-4 rounded-2xl bg-glass/[.04] border border-line/10 p-3 text-sm">
            <div className="font-medium">AstroFact {nov.version}</div>
            {nov.notas && <pre className="whitespace-pre-wrap font-sans text-xs text-muted mt-2 max-h-40 overflow-auto">{nov.notas}</pre>}
            <button className="btn-primary mt-3" disabled={pct !== undefined} onClick={() => { setPct(0); nov.instalar(setPct).catch((e) => { setPct(undefined); toast((e as Error).message, "error"); }); }}><Download size={16} />{pct === undefined ? "Instalar y reiniciar" : `Descargando… ${pct}%`}</button>
          </div>}
        </>)}
    </Panel>
  );
}
