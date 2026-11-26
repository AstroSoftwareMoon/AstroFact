import { useState } from "react";
import { CheckCircle2, Paperclip, Plus, Receipt, Search, Trash2 } from "lucide-react";
import { validateNif } from "@astrofact/fiscal-core";
import { CATEGORIAS_GASTO, calcularGasto, type CategoriaGasto, type Gasto, type GastoEntrada, type LineaGasto } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Chip, Modal, Panel, Titulo, Vacio } from "../ui/kit";
import { euros, fecha } from "../format";
import { descargar } from "../platform/storage";

const TIPOS = ["21", "10", "4", "0"];
const RECARGOS: Record<string, string> = { "21": "5.2", "10": "1.4", "4": "0.5" };

function FormGasto({ inicial, onFin }: { inicial?: Gasto; onFin: () => void }) {
  const { store, obligado: o, toast } = useApp();
  const proveedores = store.terceros(o.id).filter((t) => t.tipo !== "cliente");
  const [g, setG] = useState<GastoEntrada>(inicial ? { ...inicial } : { proveedorNombre: "", fecha: store.hoy(o.id), concepto: "", categoria: "otros", desglose: [{ base: "", tipo: "21" }], pctDeducible: "100" });
  const [ret, setRet] = useState(inicial && Number(inicial.retencion) ? "manual" : "");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [err, setErr] = useState<string>();
  const nif = g.proveedorNif ? validateNif(g.proveedorNif) : undefined;
  const set = (p: Partial<GastoEntrada>) => setG((x) => ({ ...x, ...p }));
  const setL = (i: number, p: Partial<LineaGasto>) => setG((x) => ({ ...x, desglose: x.desglose.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  let calc: ReturnType<typeof calcularGasto> | undefined;
  try { calc = calcularGasto(g.desglose.map((l) => ({ ...l, base: l.base || "0" })), ret && ret !== "manual" ? ret : undefined); } catch { calc = undefined; }
  const adjuntos = inicial ? store.adjuntos("gasto", inicial.id) : [];
  return (
    <form onSubmit={async (e) => {
      e.preventDefault(); setErr(undefined);
      try {
        const r = await store.guardarGasto(o.id, { ...g, desglose: g.desglose.filter((l) => l.base !== "") }, ret && ret !== "manual" ? ret : undefined);
        for (const f of archivos) await store.anadirAdjunto(o.id, "gasto", r.id, { nombre: f.name, mime: f.type || "application/octet-stream", datos: new Uint8Array(await f.arrayBuffer()) });
        toast("Gasto guardado"); onFin();
      } catch (x) { setErr((x as Error).message); }
    }}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Campo label="Proveedor"><input className="input" list="proveedores" value={g.proveedorNombre} required autoFocus onChange={(e) => {
          const p = proveedores.find((x) => x.nombre === e.target.value);
          set({ proveedorNombre: e.target.value, ...(p ? { proveedorId: p.id, proveedorNif: p.nif } : { proveedorId: undefined }) });
        }} /><datalist id="proveedores">{proveedores.map((p) => <option key={p.id} value={p.nombre} />)}</datalist></Campo>
        <Campo label="NIF del proveedor" error={nif && !nif.valid ? nif.reason : undefined}><input className="input font-mono uppercase" value={g.proveedorNif ?? ""} onChange={(e) => set({ proveedorNif: e.target.value || undefined })} /></Campo>
        <Campo label="Fecha de la factura"><input className="input" type="date" required value={g.fecha} onChange={(e) => set({ fecha: e.target.value })} /></Campo>
        <Campo label="Nº de factura del proveedor"><input className="input" value={g.numero ?? ""} onChange={(e) => set({ numero: e.target.value || undefined })} /></Campo>
        <Campo label="Concepto"><input className="input" value={g.concepto} onChange={(e) => set({ concepto: e.target.value })} placeholder="p. ej. Cuota de fibra de marzo" /></Campo>
        <Campo label="Categoría"><select className="input" value={g.categoria} onChange={(e) => set({ categoria: e.target.value as CategoriaGasto })}>{Object.entries(CATEGORIAS_GASTO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Campo>
      </div>
      <h3 className="text-sm font-medium mt-5 mb-2">Bases e IVA soportado</h3>
      <div className="space-y-2">
        {g.desglose.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_100px_110px_36px] gap-2 items-end">
            <Campo label="Base imponible"><input className="input-sm text-right tabular-nums" inputMode="decimal" value={l.base} onChange={(e) => setL(i, { base: e.target.value.replace(",", ".") })} aria-label={`Base ${i + 1}`} /></Campo>
            <Campo label="IVA %"><select className="input-sm" value={l.tipo} onChange={(e) => setL(i, { tipo: e.target.value, recargo: l.recargo ? RECARGOS[e.target.value] : undefined })}>{TIPOS.map((t) => <option key={t} value={t}>{t} %</option>)}</select></Campo>
            <Campo label="Recargo"><select className="input-sm" value={l.recargo ?? ""} onChange={(e) => setL(i, { recargo: e.target.value || undefined })}><option value="">—</option>{RECARGOS[l.tipo] && <option value={RECARGOS[l.tipo]}>{RECARGOS[l.tipo]} %</option>}</select></Campo>
            <button type="button" className="btn-ghost h-9 w-9 px-0" disabled={g.desglose.length === 1} aria-label="Quitar" onClick={() => set({ desglose: g.desglose.filter((_, j) => j !== i) })}><Trash2 size={15} /></button>
          </div>))}
        <button type="button" className="btn-ghost w-full border-dashed h-9 text-sm" onClick={() => set({ desglose: [...g.desglose, { base: "", tipo: "21" }] })}><Plus size={15} />Otro tipo de IVA</button>
      </div>
      <div className="grid sm:grid-cols-3 gap-4 mt-4">
        <Campo label="Retención IRPF soportada"><select className="input" value={ret} onChange={(e) => setRet(e.target.value)}><option value="">Sin retención</option><option value="7">7 %</option><option value="15">15 %</option><option value="19">19 % (alquiler)</option>{ret === "manual" && <option value="manual">Importe guardado</option>}</select></Campo>
        <Campo label="% deducible" ayuda="Afectación a la actividad (p. ej. 50 % vehículo)"><input className="input text-right" inputMode="decimal" value={g.pctDeducible ?? "100"} onChange={(e) => set({ pctDeducible: e.target.value })} /></Campo>
        <Campo label="Vencimiento"><input className="input" type="date" value={g.vencimiento ?? ""} onChange={(e) => set({ vencimiento: e.target.value || undefined })} /></Campo>
      </div>
      <label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" className="h-4 w-4" checked={!!g.inversionSujetoPasivo} onChange={(e) => set({ inversionSujetoPasivo: e.target.checked })} />Inversión del sujeto pasivo (la factura no lleva IVA: lo autoliquidas tú)</label>
      <div className="mt-4">
        <Campo label="Adjuntos (ticket, factura en PDF o foto · máx. 10 MB)"><input className="input pt-2" type="file" multiple accept="application/pdf,image/*,text/xml" onChange={(e) => setArchivos(Array.from(e.target.files ?? []))} /></Campo>
        {adjuntos.length > 0 && <ul className="mt-2 text-sm space-y-1">{adjuntos.map((a) => <li key={a.id} className="flex items-center gap-2"><Paperclip size={13} className="text-muted" />
          <button type="button" className="text-accent truncate" onClick={async () => { const d = await store.adjuntoDatos(a.id); if (d) descargar(d.nombre, d.datos, d.mime); }}>{a.nombre}</button>
          <span className="text-xs text-muted">{Math.ceil(a.tamano / 1024)} KB</span>
          <button type="button" className="btn-ghost h-7 w-7 px-0 ml-auto" aria-label="Eliminar adjunto" onClick={async () => { await store.eliminarAdjunto(a.id); toast("Adjunto eliminado"); }}><Trash2 size={13} /></button></li>)}</ul>}
      </div>
      {calc && <div className="mt-4 flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm tabular-nums text-muted">
        <span>Base {euros(calc.baseTotal)}</span><span>IVA {euros(calc.cuotaTotal)}</span>{Number(calc.retencion) > 0 && <span>Retención −{euros(calc.retencion)}</span>}<span className="text-fg font-semibold">Total {euros(calc.total)}</span></div>}
      {err && <p className="text-sm text-bad mt-3" role="alert">{err}</p>}
      <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn-ghost" onClick={onFin}>Cancelar</button><button className="btn-primary">Guardar gasto</button></div>
    </form>
  );
}

export default function Gastos() {
  const { store, obligado: o, toast, puede } = useApp();
  const [q, setQ] = useState(""); const [edit, setEdit] = useState<Gasto | "nuevo" | null>(null); const [borrar, setBorrar] = useState<Gasto | null>(null);
  const gs = store.gastos(o.id, { buscar: q });
  const pendiente = gs.filter((g) => g.estadoPago === "pendiente").reduce((a, g) => a + Number(g.total), 0);
  const escribir = puede("contable");
  return (
    <>
      <Titulo titulo="Gastos" sub="Facturas recibidas y tickets, con su IVA soportado y adjuntos." acciones={escribir && <button className="btn-primary" onClick={() => setEdit("nuevo")}><Plus size={16} />Nuevo gasto</button>} />
      <Panel className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-line/10 flex flex-wrap gap-3 items-center justify-between">
          <div className="relative max-w-sm flex-1"><Search size={16} className="absolute left-3 top-3 text-muted" /><input className="input pl-9" placeholder="Buscar proveedor, concepto o número" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {pendiente > 0 && <span className="text-sm text-muted">Pendiente de pago: <b className="text-warn tabular-nums">{euros(pendiente)}</b></span>}
        </div>
        {gs.length === 0 ? <Vacio icono={<Receipt />} titulo="Sin gastos" texto={q ? "No hay resultados." : "Registra tus facturas de proveedores y tickets para el libro de recibidas y el IVA soportado."} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-3 font-medium">Fecha</th><th className="font-medium">Proveedor</th><th className="font-medium hidden md:table-cell">Categoría</th><th className="font-medium">Pago</th><th className="px-5 font-medium text-right">Total</th><th /></tr></thead>
            <tbody>{gs.map((g) => (
              <tr key={g.id} className="fila cursor-pointer" onClick={() => escribir && setEdit(g)}>
                <td className="px-5 py-3 whitespace-nowrap text-muted">{fecha(g.fecha)}</td>
                <td className="py-3 max-w-[240px]"><div className="truncate font-medium">{g.proveedorNombre}</div><div className="text-xs text-muted truncate">{g.numero ? `${g.numero} · ` : ""}{g.concepto}</div></td>
                <td className="py-3 hidden md:table-cell text-muted">{CATEGORIAS_GASTO[g.categoria]}{g.adjuntos > 0 && <Paperclip size={12} className="inline ml-1.5" />}</td>
                <td className="py-3"><Chip tono={g.estadoPago === "pagado" ? "ok" : "warn"}>{g.estadoPago}</Chip></td>
                <td className="px-5 py-3 text-right tabular-nums font-medium">{euros(g.total)}</td>
                <td className="pr-4 py-3 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {escribir && g.estadoPago === "pendiente" && <button className="btn-ghost h-8 text-xs" onClick={async () => { await store.marcarGastoPagado(g.id, store.hoy(o.id)); toast("Marcado como pagado"); }}><CheckCircle2 size={14} />Pagado</button>}
                  {escribir && <button className="btn-ghost h-8 w-8 px-0" aria-label="Eliminar gasto" onClick={() => setBorrar(g)}><Trash2 size={14} /></button>}
                </td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
      <Modal abierto={!!edit} onClose={() => setEdit(null)} titulo={edit === "nuevo" ? "Nuevo gasto" : "Editar gasto"} ancho="max-w-2xl">
        {edit && <FormGasto inicial={edit === "nuevo" ? undefined : edit} onFin={() => setEdit(null)} />}
      </Modal>
      <Modal abierto={!!borrar} onClose={() => setBorrar(null)} titulo="¿Eliminar el gasto?">
        <p className="text-sm text-muted">Se eliminará del libro de facturas recibidas junto con sus adjuntos. Conserva el original: la normativa obliga a guardar las facturas recibidas durante el plazo de prescripción.</p>
        <div className="flex justify-end gap-2 mt-6"><button className="btn-ghost" onClick={() => setBorrar(null)}>Cancelar</button>
          <button className="btn-danger" onClick={async () => { await store.eliminarGasto(borrar!.id); toast("Gasto eliminado"); setBorrar(null); }}>Eliminar</button></div>
      </Modal>
    </>
  );
}
