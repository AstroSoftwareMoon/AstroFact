import { useMemo, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, FolderArchive, Info } from "lucide-react";
import { aCsv, aXlsx, trimestreRango, ventasPorMes, type Hoja } from "@astrofact/informes";
import { useApp } from "../state/app";
import { Campo, Modal, Panel, Titulo } from "../ui/kit";
import { euros } from "../format";
import { descargar } from "../platform/storage";
import { hoja130, hojaIva, hojaVentas, informesPeriodo, paqueteGestor } from "../platform/informes";

type Periodo = "1" | "2" | "3" | "4" | "anual";
type Vista = "iva" | "irpf" | "emitidas" | "recibidas" | "ventas";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function TablaHoja({ h }: { h: Hoja }) {
  if (!h.filas.length) return <p className="text-sm text-muted p-5">Sin datos en el periodo.</p>;
  return (
    <div className="overflow-x-auto"><table className="w-full text-sm">
      <thead><tr className="text-left text-xs text-muted">{h.columnas.map((c, j) => <th key={c} className={`px-3 py-2 font-medium whitespace-nowrap first:pl-5 ${h.filas.some((f) => typeof f[j] === "number") ? "text-right" : ""}`}>{c}</th>)}</tr></thead>
      <tbody>{h.filas.map((f, i) => <tr key={i} className="fila">{f.map((v, j) => <td key={j} className={`px-3 py-2 whitespace-nowrap first:pl-5 ${typeof v === "number" ? "text-right tabular-nums" : ""}`}>{typeof v === "number" ? v.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : v}</td>)}</tr>)}</tbody>
    </table></div>);
}

export default function Informes() {
  const { store, obligado: o, toast } = useApp();
  const hoy = store.hoy(o.id);
  const [anio, setAnio] = useState(Number(hoy.slice(0, 4)));
  const [per, setPer] = useState<Periodo>(String(Math.floor((Number(hoy.slice(5, 7)) - 1) / 3) + 1) as Periodo);
  const [vista, setVista] = useState<Vista>("iva");
  const [op, setOp] = useState({ simplificada: true, profesional: true, pagosAnteriores: "", otrosGastos: "" });
  const [paquete, setPaquete] = useState(false); const [inc, setInc] = useState({ pdfs: true, adjuntos: true, registros: true }); const [prog, setProg] = useState<string>();
  const { desde, hasta } = per === "anual" ? { desde: `${anio}-01-01`, hasta: `${anio}-12-31` } : trimestreRango(anio, Number(per) as 1);
  const op130 = { anio, trimestre: (per === "anual" ? 4 : Number(per)) as 1 | 2 | 3 | 4, simplificada: op.simplificada, profesional: op.profesional, pagosAnteriores: op.pagosAnteriores.replace(",", ".") || undefined, otrosGastos: op.otrosGastos.replace(",", ".") || undefined };
  const inf = useMemo(() => informesPeriodo(store, o, desde, hasta, op130), [store, o, desde, hasta, JSON.stringify(op130)]); // eslint-disable-line react-hooks/exhaustive-deps
  const ventas = hojaVentas(store, o, desde, hasta);
  const meses = ventasPorMes(store.facturas(o.id), anio); const max = Math.max(1, ...meses.map((m) => Number(m.base)));
  const hojas: Record<Vista, Hoja> = { iva: hojaIva(inf.iva), irpf: hoja130(inf.p130!), emitidas: inf.emitidas, recibidas: inf.recibidas, ventas };
  const sufijo = `${anio}-${per === "anual" ? "anual" : `${per}T`}`;
  const VISTAS: [Vista, string][] = [["iva", "IVA trimestral"], ["irpf", "Pago fraccionado (130)"], ["emitidas", "Libro de emitidas"], ["recibidas", "Libro de recibidas"], ["ventas", "Ventas por cliente"]];
  return (
    <>
      <Titulo titulo="Informes" sub="Libros registro y resúmenes para preparar tus impuestos o enviárselos a tu asesor." acciones={<button className="btn-primary" onClick={() => setPaquete(true)}><FolderArchive size={16} />Paquete para el gestor</button>} />
      <div className="rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm flex gap-2 mb-5"><Info size={16} className="text-warn shrink-0 mt-0.5" /><span>Los resúmenes de IVA (modelo 303) y del pago fraccionado (modelo 130) son una <b>ayuda orientativa</b>: AstroFact no presenta declaraciones ni sustituye a tu asesor fiscal. Comprueba siempre el modelo oficial vigente en la sede de la AEAT.</span></div>
      <Panel className="mb-5">
        <div className="flex flex-wrap items-end gap-3">
          <Campo label="Año"><select className="input w-28" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{Array.from({ length: 6 }, (_, i) => Number(hoy.slice(0, 4)) - i).map((a) => <option key={a}>{a}</option>)}</select></Campo>
          <Campo label="Periodo"><select className="input w-40" value={per} onChange={(e) => setPer(e.target.value as Periodo)}><option value="1">1.er trimestre</option><option value="2">2.º trimestre</option><option value="3">3.er trimestre</option><option value="4">4.º trimestre</option><option value="anual">Año completo</option></select></Campo>
          <div className="ml-auto flex gap-2">
            <button className="btn-ghost" onClick={() => descargar(`informes-${o.nif}-${sufijo}.xlsx`, aXlsx([inf.emitidas, inf.recibidas, hojaIva(inf.iva), hoja130(inf.p130!), ventas]), XLSX)}><FileSpreadsheet size={16} />Excel (todo)</button>
            <button className="btn-ghost" onClick={() => descargar(`${hojas[vista].nombre.replace(/\s+/g, "-").toLowerCase()}-${sufijo}.csv`, aCsv(hojas[vista]), "text/csv;charset=utf-8")}><Download size={16} />CSV</button>
          </div>
        </div>
      </Panel>
      <div className="grid sm:grid-cols-4 gap-3 mb-5">
        <Panel><div className="text-xs text-muted">IVA devengado</div><div className="text-xl font-semibold tabular-nums mt-1">{euros(inf.iva.totalDevengado)}</div></Panel>
        <Panel><div className="text-xs text-muted">IVA deducible</div><div className="text-xl font-semibold tabular-nums mt-1">{euros(inf.iva.totalDeducible)}</div></Panel>
        <Panel><div className="text-xs text-muted">Resultado IVA (orientativo)</div><div className={`text-xl font-semibold tabular-nums mt-1 ${Number(inf.iva.resultado) > 0 ? "text-warn" : "text-ok"}`}>{euros(inf.iva.resultado)}</div></Panel>
        <Panel><div className="text-xs text-muted">Pago fraccionado (orientativo)</div><div className="text-xl font-semibold tabular-nums mt-1">{euros(inf.p130!.aIngresar)}</div></Panel>
      </div>
      <div className="flex gap-2 mb-3 overflow-x-auto">{VISTAS.map(([k, l]) => <button key={k} className={`chip h-9 px-4 text-sm whitespace-nowrap ${vista === k ? "border-accent/50 text-fg bg-glass/[.1]" : "text-muted"}`} onClick={() => setVista(k)}>{l}</button>)}</div>
      {vista === "irpf" && <Panel className="mb-3">
        <div className="grid sm:grid-cols-4 gap-4 items-end">
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="h-4 w-4" checked={op.simplificada} onChange={(e) => setOp({ ...op, simplificada: e.target.checked })} />Estimación directa simplificada</label>
          <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="h-4 w-4" checked={op.profesional} onChange={(e) => setOp({ ...op, profesional: e.target.checked })} />Actividad profesional (restar retenciones)</label>
          <Campo label="Pagos de trimestres anteriores"><input className="input text-right" inputMode="decimal" value={op.pagosAnteriores} onChange={(e) => setOp({ ...op, pagosAnteriores: e.target.value })} placeholder="0,00" /></Campo>
          <Campo label="Otros gastos (cuota autónomos…)" ayuda="Acumulado desde el 1 de enero"><input className="input text-right" inputMode="decimal" value={op.otrosGastos} onChange={(e) => setOp({ ...op, otrosGastos: e.target.value })} placeholder="0,00" /></Campo>
        </div>
      </Panel>}
      <Panel className="!p-0 overflow-hidden"><TablaHoja h={hojas[vista]} /></Panel>
      {vista === "ventas" && <Panel className="mt-5">
        <h2 className="font-semibold flex items-center gap-2 mb-4"><BarChart3 size={17} className="text-accent" />Facturación por mes {anio} (base imponible)</h2>
        <div className="grid grid-cols-12 gap-1.5 items-end h-40" role="img" aria-label={`Facturación mensual de ${anio}`}>
          {meses.map((m) => <div key={m.mes} className="flex flex-col items-center gap-1 h-full justify-end" title={`${m.mes}/${anio}: ${euros(m.base)}`}>
            <div className="w-full rounded-t-lg bg-accent/70" style={{ height: `${(Number(m.base) / max) * 100}%`, minHeight: Number(m.base) ? 3 : 0 }} />
            <span className="text-[10px] text-muted">{"EFMAMJJASOND"[m.mes - 1]}</span></div>)}
        </div>
      </Panel>}
      <Modal abierto={paquete} onClose={() => setPaquete(false)} titulo={`Paquete para el gestor · ${sufijo}`}>
        <p className="text-sm text-muted">Un ZIP con los libros en Excel y CSV, los resúmenes del periodo y, si quieres, los PDF de tus facturas, los justificantes de gastos y los registros de facturación.</p>
        <div className="mt-4 space-y-2 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={inc.pdfs} onChange={(e) => setInc({ ...inc, pdfs: e.target.checked })} />PDF de las facturas emitidas</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={inc.adjuntos} onChange={(e) => setInc({ ...inc, adjuntos: e.target.checked })} />Justificantes adjuntos a los gastos</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-4 w-4" checked={inc.registros} onChange={(e) => setInc({ ...inc, registros: e.target.checked })} />Registros de facturación (XML)</label>
        </div>
        <div className="flex justify-end gap-2 mt-6"><button className="btn-ghost" onClick={() => setPaquete(false)}>Cancelar</button>
          <button className="btn-primary" disabled={!!prog} onClick={async () => {
            setProg("Preparando…");
            try { descargar(`astrofact-gestor-${o.nif}-${sufijo}.zip`, await paqueteGestor(store, o, desde, hasta, op130, inc, setProg), "application/zip"); toast("Paquete generado"); setPaquete(false); }
            catch (e) { toast((e as Error).message, "error"); } finally { setProg(undefined); }
          }}><FolderArchive size={16} />{prog ?? "Generar ZIP"}</button></div>
      </Modal>
    </>
  );
}
