import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Pause, Play, Plus, Repeat, Zap } from "lucide-react";
import { calcularTotales } from "@astrofact/fiscal-core";
import type { Recurrencia } from "@astrofact/db";
import { useApp } from "../state/app";
import { Chip, Panel, Titulo, Vacio } from "../ui/kit";
import { euros, fecha } from "../format";

const PER: Record<string, string> = { mensual: "Mensual", trimestral: "Trimestral", semestral: "Semestral", anual: "Anual" };

export default function Recurrentes() {
  const { store, obligado: o, toast, puede, modo } = useApp();
  const nav = useNavigate();
  const rs = store.recurrencias(o.id);
  const [busy, setBusy] = useState(false);
  const escribir = puede("contable");
  const total = (r: Recurrencia) => { try { return calcularTotales(r.borrador).totalAPagar.toFixed(2); } catch { return "0"; } };
  const alternar = async (r: Recurrencia) => { await store.guardarRecurrencia(o.id, { ...r, activa: !r.activa }); toast(r.activa ? "Pausada" : "Reactivada"); };
  return (
    <>
      <Titulo titulo="Facturas recurrentes" sub={`Cuotas y servicios periódicos. ${modo === "servidor" ? "El servidor las procesa automáticamente." : "Se procesan al abrir la aplicación y cada hora mientras está abierta."}`}
        acciones={escribir && <>
          <button className="btn-ghost" disabled={busy} onClick={async () => { setBusy(true); try { const r = await store.procesarRecurrentes(o.id); toast(`${r.emitidas.length} emitidas · ${r.borradores.length} borradores${r.errores.length ? ` · ${r.errores.length} errores` : ""}`, r.errores.length ? "error" : "ok"); } finally { setBusy(false); } }}><Zap size={16} />Procesar ahora</button>
          <button className="btn-primary" onClick={() => nav("/recurrentes/nueva", { state: { destino: { tipo: "recurrente" } } })}><Plus size={16} />Nueva</button></>} />
      <Panel className="!p-0 overflow-hidden">
        {rs.length === 0 ? <Vacio icono={<Repeat />} titulo="Sin facturas recurrentes" texto="Crea una plantilla y AstroFact generará la factura cada mes, trimestre o año: emitida automáticamente o como borrador para revisarla." /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-3 font-medium">Nombre</th><th className="font-medium hidden sm:table-cell">Cliente</th><th className="font-medium">Periodicidad</th><th className="font-medium">Próxima</th><th className="font-medium hidden md:table-cell">Modo</th><th className="px-5 font-medium text-right">Importe</th><th /></tr></thead>
            <tbody>{rs.map((r) => (
              <tr key={r.id} className={`fila ${r.activa ? "" : "opacity-60"}`}>
                <td className="px-5 py-3 font-medium cursor-pointer" onClick={() => escribir && nav("/recurrentes/nueva", { state: { destino: { tipo: "recurrente", id: r.id } } })}>{r.nombre}</td>
                <td className="py-3 hidden sm:table-cell truncate max-w-[200px]">{r.borrador.terceroId ? store.tercero(r.borrador.terceroId)?.nombre : "—"}</td>
                <td className="py-3">{PER[r.periodicidad]}</td>
                <td className="py-3 text-muted whitespace-nowrap">{r.activa ? fecha(r.proxima) : "—"}{r.hasta && <span className="text-xs"> (hasta {fecha(r.hasta)})</span>}</td>
                <td className="py-3 hidden md:table-cell">{r.autoEmitir ? <Chip tono="acc">Emisión automática</Chip> : <Chip>Borrador</Chip>}</td>
                <td className="px-5 py-3 text-right tabular-nums">{euros(total(r))}</td>
                <td className="pr-4 text-right">{escribir && <button className="btn-ghost h-8 w-8 px-0" aria-label={r.activa ? "Pausar" : "Reactivar"} onClick={() => alternar(r)}>{r.activa ? <Pause size={14} /> : <Play size={14} />}</button>}</td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
      <p className="text-xs text-muted mt-3">Con emisión automática, la factura se expide con la fecha del día en que se procesa (nunca con fecha futura) y genera su registro de facturación como cualquier otra.</p>
    </>
  );
}
