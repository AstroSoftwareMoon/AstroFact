import { useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Clock, RefreshCw, Send, XCircle } from "lucide-react";
import { textoErrorAeat } from "@astrofact/fiscal-core";
import { useApp } from "../state/app";
import { Chip, Panel, Titulo, Vacio } from "../ui/kit";
import { ETIQUETA_AEAT } from "../components/EstadoFactura";
import { fechaHora } from "../format";

/** Panel de estado de los envíos VERI*FACTU (art. 16 Orden HAC/1177/2024). */
export default function Envios() {
  const { store, obligado: o, toast, puede, cliente } = useApp();
  const [busy, setBusy] = useState<number>();
  const r = store.resumenAeat(o.id);
  const envios = store.envios(o.id, 50);
  const regs = store.registros(o.id).filter((x) => x.estadoAeat && x.estadoAeat !== "aceptado").reverse();
  const ultimos = new Map<number, number>(); for (const x of store.registros(o.id)) if (x.facturaId) ultimos.set(x.facturaId, x.id);
  const tarjetas = [
    { k: "pendiente", n: r.pendiente + r.enviando, icon: Clock, tono: "text-muted" },
    { k: "aceptado", n: r.aceptado, icon: CheckCircle2, tono: "text-ok" },
    { k: "aceptado_con_errores", n: r.aceptado_con_errores, icon: CheckCircle2, tono: "text-warn" },
    { k: "rechazado", n: r.rechazado, icon: XCircle, tono: "text-bad" },
  ] as const;
  return (
    <>
      {cliente?.aeatSimulada && <div className="mb-4 rounded-2xl border border-warn/50 bg-warn/10 px-4 py-3 text-sm" role="status"><b>Simulador de la AEAT:</b> este servidor está configurado para enviar a un simulador de pruebas (ASTROFACT_AEAT_URL), no a la AEAT. Los CSV «SIM…» no tienen validez.</div>}
      <Titulo titulo="Envíos a la AEAT" sub={`VERI*FACTU · entorno de ${o.entorno === "pruebas" ? "PRUEBAS" : "producción"} · los registros se envían automáticamente respetando el tiempo de espera que indica la AEAT.`} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {tarjetas.map((t) => (
          <Panel key={t.k}><div className="flex items-center justify-between text-xs text-muted"><span>{t.k === "pendiente" ? "En cola" : ETIQUETA_AEAT[t.k][0]}</span><t.icon size={16} className={t.tono} /></div>
            <div className="text-2xl font-semibold mt-2 tabular-nums" data-testid={`aeat-${t.k}`}>{t.n}</div></Panel>))}
      </div>
      <Panel className="mt-5 !p-0 overflow-hidden">
        <h2 className="font-semibold px-5 pt-5">Registros que requieren atención o están en cola</h2>
        {regs.length === 0 ? <Vacio icono={<CheckCircle2 />} titulo="Todo al día" texto="No hay registros pendientes ni rechazados." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm mt-3"><tbody>{regs.map((x) => {
            const [et, tono] = ETIQUETA_AEAT[x.estadoAeat!];
            const subsanable = (x.estadoAeat === "rechazado" || x.estadoAeat === "aceptado_con_errores") && x.facturaId && ultimos.get(x.facturaId) === x.id;
            return (
              <tr key={x.id} className="fila">
                <td className="px-5 py-3 font-mono whitespace-nowrap">{x.facturaId ? <Link className="text-accent" to={`/facturas/${x.facturaId}`}>{x.numSerie}</Link> : x.numSerie}</td>
                <td className="py-3"><Chip tono={x.tipo === "alta" ? "acc" : "bad"}>{x.tipo}</Chip>{x.situacion && x.situacion !== "nuevo" && x.situacion !== "normal" && <span className="ml-1 text-xs text-muted">{x.situacion.replace(/_/g, " ")}</span>}</td>
                <td className="py-3"><Chip tono={tono}>{et}</Chip></td>
                <td className="py-3 text-xs text-muted max-w-[360px]">{x.aeatCodigo ? <><b className="font-mono">{x.aeatCodigo}</b> · {x.aeatDescripcion ?? textoErrorAeat(x.aeatCodigo)}</> : ""}</td>
                <td className="px-5 py-3 text-right">{subsanable && puede("contable") && <button className="btn-ghost h-8 text-xs" disabled={busy === x.id} onClick={async () => { setBusy(x.id); try { await store.subsanar(x.facturaId!); toast("Registro de subsanación generado y en cola"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(undefined); } }}><RefreshCw size={14} />Subsanar</button>}</td>
              </tr>);
          })}</tbody></table></div>)}
      </Panel>
      <Panel className="mt-5 !p-0 overflow-hidden">
        <h2 className="font-semibold px-5 pt-5">Historial de envíos</h2>
        {envios.length === 0 ? <Vacio icono={<Send />} titulo="Sin envíos todavía" texto="El primer envío se hará en cuanto emitas una factura." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm mt-3">
            <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-2 font-medium">#</th><th className="font-medium">Fecha</th><th className="font-medium">Registros</th><th className="font-medium">Resultado</th><th className="font-medium">CSV</th><th className="px-5 font-medium">Espera</th></tr></thead>
            <tbody>{envios.map((e) => (
              <tr key={e.id} className="fila">
                <td className="px-5 py-2.5 text-muted tabular-nums">{e.id}</td><td className="py-2.5 text-muted whitespace-nowrap">{fechaHora(e.creadoEn)}</td><td className="py-2.5 tabular-nums">{e.numRegistros}</td>
                <td className="py-2.5"><Chip tono={e.estado === "Correcto" ? "ok" : e.estado === "ParcialmenteCorrecto" ? "warn" : e.estado === "enviando" ? "acc" : "bad"}>{e.estado === "error_transporte" ? "Error de conexión (se reintenta)" : e.estado === "fault" ? "Rechazo completo" : e.estado}</Chip>{e.error && <div className="text-xs text-muted mt-1 max-w-[320px] truncate" title={e.error}>{e.error}</div>}</td>
                <td className="py-2.5 font-mono text-xs" data-testid="csv">{e.csv ?? "—"}</td><td className="px-5 py-2.5 text-muted">{e.tiempoEspera ? `${e.tiempoEspera} s` : "—"}</td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
    </>
  );
}
