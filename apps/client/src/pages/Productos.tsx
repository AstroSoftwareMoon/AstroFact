import { useState } from "react";
import { Archive, Package, Plus, Search } from "lucide-react";
import type { Producto } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Modal, Panel, Titulo, Vacio } from "../ui/kit";
import { euros } from "../format";

export default function Productos() {
  const { store, obligado: o, toast, t } = useApp();
  const [q, setQ] = useState(""); const [edit, setEdit] = useState<(Partial<Producto> & { nombre: string; precio: string }) | null>(null); const [err, setErr] = useState<string>();
  const lista = store.productos(o.id, q);
  return (
    <>
      <Titulo titulo="Productos y servicios" acciones={<button className="btn-primary" onClick={() => setEdit({ nombre: "", precio: "", tipo: "21", impuesto: "01", sujetaRetencion: true })}><Plus size={16} />Nuevo</button>} />
      <Panel className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-line/10"><div className="relative max-w-sm"><Search size={16} className="absolute left-3 top-3 text-muted" /><input className="input pl-9" placeholder={t("comun.buscar")} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        {lista.length === 0 ? <Vacio icono={<Package />} titulo="Catálogo vacío" texto="Guarda tus productos y servicios para añadirlos a las facturas con un clic." /> : (
          <table className="w-full text-sm"><tbody>{lista.map((p) => (
            <tr key={p.id} className="fila">
              <td className="px-5 py-3 cursor-pointer" onClick={() => setEdit(p)}><div className="font-medium">{p.nombre}</div><div className="text-xs text-muted">{p.codigo ?? ""}</div></td>
              <td className="py-3 text-muted">{p.exenta ? `Exento ${p.exenta}` : `IVA ${p.tipo ?? "—"} %`}</td>
              <td className="py-3 text-right tabular-nums font-medium">{euros(p.precio)}</td>
              <td className="px-5 py-3 text-right"><button className="btn-ghost h-8 w-8 px-0" aria-label="Archivar" onClick={() => { store.archivarProducto(p.id); toast("Producto archivado"); }}><Archive size={14} /></button></td>
            </tr>))}</tbody></table>)}
      </Panel>
      <Modal abierto={!!edit} onClose={() => setEdit(null)} titulo={edit?.id ? "Editar producto" : "Nuevo producto"}>
        {edit && <form onSubmit={(e) => { e.preventDefault(); try { store.guardarProducto(o.id, edit); toast("Producto guardado"); setEdit(null); setErr(undefined); } catch (x) { setErr((x as Error).message); } }}>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Campo label="Nombre"><input className="input" autoFocus required value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></Campo></div>
            <Campo label="Código (opcional)"><input className="input" value={edit.codigo ?? ""} onChange={(e) => setEdit({ ...edit, codigo: e.target.value })} /></Campo>
            <Campo label="Precio sin impuestos (€)"><input className="input text-right" inputMode="decimal" required value={edit.precio} onChange={(e) => setEdit({ ...edit, precio: e.target.value })} /></Campo>
            <Campo label="IVA"><select className="input" value={edit.exenta ? `e:${edit.exenta}` : edit.tipo ?? "21"} onChange={(e) => { const v = e.target.value; setEdit(v.startsWith("e:") ? { ...edit, exenta: v.slice(2), tipo: undefined } : { ...edit, tipo: v, exenta: undefined }); }}>
              <option value="21">21 %</option><option value="10">10 %</option><option value="4">4 %</option><option value="0">0 %</option><option value="e:E1">Exento (art. 20)</option></select></Campo>
            <label className="flex items-center gap-2 text-sm mt-6"><input type="checkbox" className="h-4 w-4" checked={edit.sujetaRetencion !== false} onChange={(e) => setEdit({ ...edit, sujetaRetencion: e.target.checked })} />Sujeto a retención IRPF</label>
          </div>
          {err && <p className="text-sm text-bad mt-3">{err}</p>}
          <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancelar</button><button className="btn-primary">Guardar</button></div>
        </form>}
      </Modal>
    </>
  );
}
