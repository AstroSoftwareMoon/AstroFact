import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FilePlus2, FileText, Search } from "lucide-react";
import { useApp } from "../state/app";
import { Chip, Panel, Titulo, Vacio } from "../ui/kit";
import EstadoFactura from "../components/EstadoFactura";
import { euros, fecha } from "../format";

export default function Facturas() {
  const { store, obligado: o, t } = useApp();
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const fs = store.facturas(o.id, { buscar: q });
  return (
    <>
      <Titulo titulo="Facturas" sub="Las facturas emitidas no se pueden modificar ni borrar: usa rectificativas o anulaciones." acciones={<Link to="/facturas/nueva" className="btn-primary"><FilePlus2 size={16} />Nueva factura</Link>} />
      <Panel className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-line/10"><div className="relative max-w-sm"><Search size={16} className="absolute left-3 top-3 text-muted" /><input className="input pl-9" placeholder={t("comun.buscar")} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        {fs.length === 0 ? <Vacio icono={<FileText />} titulo="Sin facturas" texto={q ? "No hay resultados para tu búsqueda." : "Emite tu primera factura."} /> : (
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted"><th className="px-5 py-3 font-medium">Número</th><th className="font-medium">Cliente</th><th className="font-medium hidden md:table-cell">Fecha</th><th className="font-medium hidden lg:table-cell">Estado</th><th className="font-medium">Cobro</th><th className="px-5 font-medium text-right">Total</th></tr></thead>
            <tbody>{fs.map((f) => (
              <tr key={f.id} className="fila cursor-pointer" onClick={() => nav(`/facturas/${f.id}`)}>
                <td className="px-5 py-3 font-mono whitespace-nowrap">{f.numSerie}{f.dePruebas && <span className="ml-2 text-[10px] text-warn">PRUEBAS</span>}</td>
                <td className="py-3 max-w-[220px] truncate">{f.datos.destinatarios?.[0]?.nombre ?? "—"}</td>
                <td className="py-3 text-muted hidden md:table-cell">{fecha(f.fechaExpedicion)}</td>
                <td className="py-3 hidden lg:table-cell"><EstadoFactura f={f} /></td>
                <td className="py-3"><Chip tono={f.estadoCobro === "cobrada" ? "ok" : "warn"}>{f.estadoCobro}</Chip></td>
                <td className="px-5 py-3 text-right tabular-nums font-medium">{euros(f.totales.importeTotal)}</td>
              </tr>))}</tbody>
          </table></div>)}
      </Panel>
    </>
  );
}
