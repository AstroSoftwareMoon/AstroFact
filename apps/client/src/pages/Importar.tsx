import { useState } from "react";
import { Download, FileUp, Package, Users } from "lucide-react";
import { aCsv, importarClientes, importarProductos, leerCsv, leerXlsx, type ClienteImportado, type ProductoImportado, type ResultadoImportacion } from "@astrofact/informes";
import { useApp } from "../state/app";
import { Panel, Titulo } from "../ui/kit";
import { descargar } from "../platform/storage";

type Tipo = "clientes" | "productos";
const PLANTILLAS: Record<Tipo, { columnas: string[]; ejemplo: string[] }> = {
  clientes: { columnas: ["Nombre", "NIF", "Email", "Teléfono", "Dirección", "CP", "Municipio", "Provincia", "País", "Forma de pago", "Retención"], ejemplo: ["Ejemplo SL", "B12345674", "hola@ejemplo.es", "600000000", "Calle Mayor 1", "28013", "Madrid", "Madrid", "ES", "Transferencia", ""] },
  productos: { columnas: ["Nombre", "Código", "Precio", "IVA", "Unidad", "Descripción"], ejemplo: ["Hora de consultoría", "CONS", "45,00", "21", "hora", ""] },
};

export default function Importar() {
  const { store, obligado: o, toast } = useApp();
  const [tipo, setTipo] = useState<Tipo>("clientes");
  const [res, setRes] = useState<ResultadoImportacion<ClienteImportado | ProductoImportado> & { nombre: string; existentes: number }>();
  const [busy, setBusy] = useState(false);
  const leer = async (f: File) => {
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let filas: string[][];
      if (/\.xlsx$/i.test(f.name)) filas = await leerXlsx(bytes);
      else { const utf = new TextDecoder("utf-8", { fatal: false }).decode(bytes); filas = leerCsv(utf.includes("�") ? new TextDecoder("windows-1252").decode(bytes) : utf); }
      const r = tipo === "clientes" ? importarClientes(filas) : importarProductos(filas);
      // No duplicar lo que ya existe (NIF para clientes, código o nombre para productos)
      const nifs = new Set(store.terceros(o.id).map((t) => t.nif).filter(Boolean));
      const prods = new Set(store.productos(o.id).flatMap((p) => [p.codigo, p.nombre.toLowerCase()]).filter(Boolean));
      const validos = (r.validos as (ClienteImportado | ProductoImportado)[]).filter((v) => tipo === "clientes" ? !((v as ClienteImportado).nif && nifs.has((v as ClienteImportado).nif)) : !prods.has((v as ProductoImportado).codigo ?? (v as ProductoImportado).nombre.toLowerCase()));
      setRes({ ...r, validos, nombre: f.name, existentes: r.validos.length - validos.length });
    } catch (e) { toast((e as Error).message, "error"); }
  };
  const importar = async () => {
    if (!res) return; setBusy(true);
    try {
      for (const v of res.validos) {
        if (tipo === "clientes") await store.guardarTercero(o.id, { ...(v as ClienteImportado), tipo: "cliente", recargoEquivalencia: !!(v as ClienteImportado).recargoEquivalencia });
        else { const p = v as ProductoImportado; await store.guardarProducto(o.id, { nombre: p.nombre, codigo: p.codigo, precio: p.precio, impuesto: "01", tipo: p.tipo ?? "21", unidad: p.unidad, descripcion: p.descripcion, sujetaRetencion: true }); }
      }
      toast(`${res.validos.length} ${tipo} importados`); setRes(undefined);
    } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  };
  const pl = PLANTILLAS[tipo];
  return (
    <>
      <Titulo titulo="Importar datos" sub="Trae tus clientes y productos desde otro programa o una hoja de cálculo (CSV o Excel .xlsx)." />
      <div className="flex gap-2 mb-4">{([["clientes", Users, "Clientes"], ["productos", Package, "Productos"]] as const).map(([k, I, l]) => <button key={k} className={`chip h-9 px-4 text-sm ${tipo === k ? "border-accent/50 text-fg bg-glass/[.1]" : "text-muted"}`} onClick={() => { setTipo(k); setRes(undefined); }}><I size={14} />{l}</button>)}</div>
      <Panel>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="btn-primary cursor-pointer"><FileUp size={16} />Elegir fichero<input type="file" className="hidden" accept=".csv,.txt,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) void leer(f); e.target.value = ""; }} /></label>
          <button className="btn-ghost" onClick={() => descargar(`plantilla-${tipo}.csv`, aCsv({ nombre: tipo, columnas: pl.columnas, filas: [pl.ejemplo] }), "text/csv;charset=utf-8")}><Download size={16} />Plantilla CSV</button>
        </div>
        <p className="text-xs text-muted mt-3">Reconocemos cabeceras habituales (Razón social, CIF/NIF, E-mail, C.P., Población, PVP, % IVA…). Los NIF se validan y no se duplican los que ya tienes. El fichero se procesa en tu dispositivo.</p>
      </Panel>
      {res && <Panel className="mt-5">
        <h2 className="font-semibold">{res.nombre}</h2>
        <p className="text-sm text-muted mt-1">{res.validos.length} listos para importar{res.existentes ? ` · ${res.existentes} ya existían` : ""}{res.errores.length ? ` · ${res.errores.length} con errores` : ""}</p>
        <p className="text-xs text-muted mt-2">Columnas reconocidas: {Object.entries(res.mapeo).map(([k, v]) => `${v} → ${k}`).join(" · ") || "ninguna"}</p>
        {res.errores.length > 0 && <ul className="mt-3 text-sm text-bad space-y-0.5 max-h-40 overflow-auto">{res.errores.map((e, i) => <li key={i}>Fila {e.fila}: {e.mensaje}</li>)}</ul>}
        {res.validos.length > 0 && <div className="overflow-x-auto mt-4 max-h-72"><table className="w-full text-sm"><tbody>{res.validos.slice(0, 50).map((v, i) => (
          <tr key={i} className="fila"><td className="px-3 py-2">{v.nombre}</td><td className="py-2 font-mono text-muted">{tipo === "clientes" ? (v as ClienteImportado).nif ?? (v as ClienteImportado).idOtro?.id ?? "" : (v as ProductoImportado).codigo ?? ""}</td>
            <td className="py-2 text-muted">{tipo === "clientes" ? (v as ClienteImportado).email ?? "" : `${(v as ProductoImportado).precio} € · IVA ${(v as ProductoImportado).tipo ?? "21"} %`}</td></tr>))}</tbody></table>
          {res.validos.length > 50 && <p className="text-xs text-muted mt-2">… y {res.validos.length - 50} más</p>}</div>}
        <div className="flex justify-end gap-2 mt-5"><button className="btn-ghost" onClick={() => setRes(undefined)}>Cancelar</button><button className="btn-primary" disabled={busy || !res.validos.length} onClick={importar}>{busy ? "Importando…" : `Importar ${res.validos.length}`}</button></div>
      </Panel>}
    </>
  );
}
