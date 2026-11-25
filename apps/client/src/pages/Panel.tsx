import { Link, useNavigate } from "react-router-dom";
import { FilePlus2, Link2, ShieldCheck, Sparkles, TrendingUp, Wallet } from "lucide-react";
import { D } from "@astrofact/fiscal-core";
import { useApp } from "../state/app";
import { Chip, Panel, Titulo, Vacio } from "../ui/kit";
import { euros, fecha } from "../format";
import { ejemploFactura } from "./ejemplo";

export default function PanelPage() {
  const { store, obligado: o } = useApp();
  const nav = useNavigate();
  const hoy = store.hoy(o.id);
  const facturas = store.facturas(o.id).filter((f) => !f.anulada);
  const mes = facturas.filter((f) => f.fechaExpedicion.slice(0, 7) === hoy.slice(0, 7));
  const tri = Math.floor((Number(hoy.slice(5, 7)) - 1) / 3);
  const trim = facturas.filter((f) => f.fechaExpedicion.slice(0, 4) === hoy.slice(0, 4) && Math.floor((Number(f.fechaExpedicion.slice(5, 7)) - 1) / 3) === tri);
  const suma = (xs: typeof facturas, k: "baseTotal" | "cuotaTotal" | "totalAPagar") => xs.reduce((a, f) => a.add(D(f.totales[k])), D(0)).toFixed(2);
  const pendiente = facturas.filter((f) => f.estadoCobro !== "cobrada");
  const regs = store.registros(o.id);
  const kpis = [
    { label: "Facturado este mes (base)", valor: euros(suma(mes, "baseTotal")), sub: `${mes.length} ${mes.length === 1 ? "factura" : "facturas"}`, icon: TrendingUp },
    { label: `IVA repercutido ${tri + 1}T`, valor: euros(suma(trim, "cuotaTotal")), sub: "Ayuda orientativa, no sustituye al modelo 303", icon: ShieldCheck },
    { label: "Pendiente de cobro", valor: euros(suma(pendiente, "totalAPagar")), sub: `${pendiente.length} ${pendiente.length === 1 ? "factura" : "facturas"}`, icon: Wallet },
    { label: "Registros encadenados", valor: String(regs.length), sub: regs.length ? `Última huella ${regs[regs.length - 1]!.huella.slice(0, 10)}…` : "Aún no hay registros", icon: Link2 },
  ];
  return (
    <>
      <Titulo titulo={o.nombre} sub="Resumen de tu facturación" acciones={<Link to="/facturas/nueva" className="btn-primary"><FilePlus2 size={16} />Nueva factura</Link>} />
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map((k, i) => (
          <Panel key={k.label} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="flex items-center justify-between text-muted text-xs"><span>{k.label}</span><k.icon size={16} className="text-accent" /></div>
            <div className="text-xl sm:text-2xl font-semibold mt-2 tabular-nums tracking-tight">{k.valor}</div>
            <div className="text-xs text-muted mt-1 truncate">{k.sub}</div>
          </Panel>))}
      </div>
      <Panel className="mt-5 !p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-5"><h2 className="font-semibold">Últimas facturas</h2><Link to="/facturas" className="text-sm text-accent">Ver todas</Link></div>
        {facturas.length === 0 ? (
          <Vacio icono={<Sparkles />} titulo="Todavía no has emitido facturas" texto="Prueba con una factura de ejemplo: podrás revisarla antes de emitirla."
            accion={<button className="btn-primary" onClick={async () => nav("/facturas/nueva", { state: { borrador: await ejemploFactura(store) } })}><Sparkles size={16} />Crear factura de ejemplo</button>} />
        ) : (
          <table className="w-full text-sm mt-3">
            <tbody>{facturas.slice(0, 6).map((f) => (
              <tr key={f.id} className="fila cursor-pointer" onClick={() => nav(`/facturas/${f.id}`)}>
                <td className="px-5 py-3 font-mono whitespace-nowrap">{f.numSerie}</td><td className="py-3 truncate max-w-[120px] sm:max-w-[220px]">{f.datos.destinatarios?.[0]?.nombre ?? "Sin destinatario"}</td>
                <td className="py-3 text-muted hidden sm:table-cell">{fecha(f.fechaExpedicion)}</td>
                <td className="py-3 hidden sm:table-cell"><Chip tono={f.estadoCobro === "cobrada" ? "ok" : "warn"}>{f.estadoCobro}</Chip></td>
                <td className="px-5 py-3 text-right tabular-nums font-medium whitespace-nowrap">{euros(f.totales.importeTotal)}</td>
              </tr>))}</tbody>
          </table>)}
      </Panel>
    </>
  );
}
