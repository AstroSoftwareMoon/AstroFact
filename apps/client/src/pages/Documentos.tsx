import { useState } from "react";
import { NavLink, useNavigate, useParams } from "react-router-dom";
import { ClipboardList, FileCheck2, FilePen, FileText, Plus, Truck } from "lucide-react";
import type { ClaseDocumento, Documento, EstadoDocumento } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Chip, Modal, Panel, Titulo, Vacio } from "../ui/kit";
import { euros, fecha } from "../format";

const CLASES: { clase: ClaseDocumento; label: string; icon: typeof FileText; vacio: string }[] = [
  { clase: "presupuesto", label: "Presupuestos", icon: ClipboardList, vacio: "Crea un presupuesto y, cuando el cliente lo acepte, conviértelo en albarán o factura con un clic." },
  { clase: "albaran", label: "Albaranes", icon: Truck, vacio: "Registra entregas y agrúpalas después en una sola factura por cliente." },
  { clase: "borrador", label: "Borradores", icon: FilePen, vacio: "Facturas a medio preparar (también las que generan las facturas recurrentes sin emisión automática)." },
];
const TONO: Record<EstadoDocumento, "ok" | "warn" | "bad" | "acc" | "neutro"> = { abierto: "neutro", enviado: "acc", aceptado: "ok", rechazado: "bad", facturado: "ok", anulado: "bad" };

export default function Documentos() {
  const { store, obligado: o, toast, puede } = useApp();
  const nav = useNavigate();
  const clase = (useParams().clase ?? "presupuesto") as ClaseDocumento;
  const info = CLASES.find((c) => c.clase === clase) ?? CLASES[0]!;
  const docs = store.documentos(o.id, clase);
  const [sel, setSel] = useState<number[]>([]);
  const [facturar, setFacturar] = useState<number[] | null>(null);
  const series = store.series(o.id).filter((s) => s.activa && s.clase === "ordinaria");
  const [serieId, setSerieId] = useState<number | undefined>(series[0]?.id);
  const [err, setErr] = useState<string>(); const [busy, setBusy] = useState(false);
  const escribir = puede("contable");
  const cliente = (d: Documento) => (d.borrador.terceroId ? store.tercero(d.borrador.terceroId)?.nombre : d.borrador.destinatarios?.[0]?.nombre) ?? "—";
  const abiertos = (d: Documento) => d.estado !== "facturado" && d.estado !== "anulado";
  const estado = async (d: Documento, e: EstadoDocumento) => { await store.cambiarEstadoDocumento(d.id, e); toast(`${d.numero}: ${e}`); };
  return (
    <>
      <Titulo titulo={info.label} sub="No son facturas ni generan registros de facturación hasta que se facturan." acciones={escribir && <button className="btn-primary" onClick={() => nav("/documentos/nuevo", { state: { destino: { tipo: "documento", clase } } })}><Plus size={16} />Nuevo {clase === "albaran" ? "albarán" : clase}</button>} />
      <div className="flex gap-2 mb-4 overflow-x-auto">{CLASES.map((c) => <NavLink key={c.clase} to={`/documentos/${c.clase}`} onClick={() => setSel([])} className={({ isActive }) => `chip h-9 px-4 text-sm ${isActive ? "border-accent/50 text-fg bg-glass/[.1]" : "text-muted"}`}><c.icon size={14} />{c.label}</NavLink>)}</div>
      <Panel className="!p-0 overflow-hidden">
        {sel.length > 0 && <div className="px-5 py-3 border-b border-line/10 flex items-center justify-between text-sm"><span>{sel.length} seleccionados</span><button className="btn-primary h-9" onClick={() => { setErr(undefined); setFacturar(sel); }}><FileCheck2 size={15} />Facturar juntos</button></div>}
        {docs.length === 0 ? <Vacio icono={<info.icon />} titulo={`Sin ${info.label.toLowerCase()}`} texto={info.vacio} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted">{clase === "albaran" && escribir && <th className="pl-5 w-8" />}<th className="px-5 py-3 font-medium">Número</th><th className="font-medium">Cliente</th><th className="font-medium hidden md:table-cell">Fecha</th><th className="font-medium">Estado</th><th className="px-5 font-medium text-right">Total</th><th /></tr></thead>
            <tbody>{docs.map((d) => (
              <tr key={d.id} className="fila">
                {clase === "albaran" && escribir && <td className="pl-5"><input type="checkbox" className="h-4 w-4" aria-label={`Seleccionar ${d.numero}`} disabled={!abiertos(d)} checked={sel.includes(d.id)} onChange={(e) => setSel((s) => (e.target.checked ? [...s, d.id] : s.filter((x) => x !== d.id)))} /></td>}
                <td className="px-5 py-3 font-mono whitespace-nowrap cursor-pointer" onClick={() => escribir && abiertos(d) && nav("/documentos/nuevo", { state: { destino: { tipo: "documento", clase, id: d.id } } })}>{d.numero}</td>
                <td className="py-3 max-w-[220px] truncate">{cliente(d)}</td>
                <td className="py-3 text-muted hidden md:table-cell">{fecha(d.fecha)}{d.validez && <span className="text-xs"> · válido hasta {fecha(d.validez)}</span>}</td>
                <td className="py-3"><Chip tono={TONO[d.estado]}>{d.estado}</Chip></td>
                <td className="px-5 py-3 text-right tabular-nums font-medium">{euros(d.total)}</td>
                <td className="pr-4 py-3 text-right whitespace-nowrap space-x-1">
                  {d.facturaId && <button className="btn-ghost h-8 text-xs" onClick={() => nav(`/facturas/${d.facturaId}`)}><FileText size={14} />Factura</button>}
                  {escribir && abiertos(d) && <>
                    {clase === "presupuesto" && d.estado === "abierto" && <button className="btn-ghost h-8 text-xs" onClick={() => estado(d, "enviado")}>Enviado</button>}
                    {clase === "presupuesto" && (d.estado === "abierto" || d.estado === "enviado") && <><button className="btn-ghost h-8 text-xs" onClick={() => estado(d, "aceptado")}>Aceptado</button><button className="btn-ghost h-8 text-xs" onClick={() => estado(d, "rechazado")}>Rechazado</button></>}
                    {clase === "presupuesto" && d.estado !== "rechazado" && <button className="btn-ghost h-8 text-xs" onClick={async () => { const a = await store.convertirEnAlbaran(d.id); toast(`Albarán ${a.numero} creado`); nav("/documentos/albaran"); }}><Truck size={14} />Albarán</button>}
                    {d.estado !== "rechazado" && (clase === "borrador"
                      ? <button className="btn-primary h-8 text-xs" onClick={() => nav("/facturas/nueva", { state: { borrador: d.borrador, documentoOrigen: d.id } })}><FileCheck2 size={14} />Revisar y emitir</button>
                      : <button className="btn-primary h-8 text-xs" onClick={() => { setErr(undefined); setFacturar([d.id]); }}><FileCheck2 size={14} />Facturar</button>)}
                  </>}
                </td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
      <Modal abierto={!!facturar} onClose={() => setFacturar(null)} titulo="Convertir en factura">
        <p className="text-sm text-muted">Se emitirá una factura con {facturar && facturar.length > 1 ? `las líneas de ${facturar.length} documentos (mismo cliente)` : "las líneas del documento"}: se generará su registro de facturación y ya no podrá modificarse.</p>
        <div className="mt-4"><Campo label="Serie"><select className="input" value={serieId} onChange={(e) => setSerieId(Number(e.target.value))}>{series.map((s) => <option key={s.id} value={s.id}>{s.codigo} · siguiente nº {s.ultimoNumero + 1}</option>)}</select></Campo></div>
        {err && <p className="text-sm text-bad mt-3" role="alert">{err}</p>}
        <div className="flex justify-end gap-2 mt-6"><button className="btn-ghost" onClick={() => setFacturar(null)}>Cancelar</button>
          <button className="btn-primary" disabled={busy || !serieId} onClick={async () => {
            setBusy(true); setErr(undefined);
            try { const f = await store.facturarDocumentos(o.id, serieId!, facturar!); toast(`Factura ${f.numSerie} emitida`); setFacturar(null); setSel([]); nav(`/facturas/${f.id}`); }
            catch (e) { const inc = (e as { incidencias?: { nivel: string; mensaje: string }[] }).incidencias; setErr(inc?.length ? inc.filter((i) => i.nivel === "error").map((i) => i.mensaje).join(" · ") : (e as Error).message); }
            finally { setBusy(false); }
          }}>{busy ? "Emitiendo…" : "Emitir factura"}</button></div>
      </Modal>
    </>
  );
}
