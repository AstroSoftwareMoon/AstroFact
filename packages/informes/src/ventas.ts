import { D, Dec, sum } from "@astrofact/fiscal-core";
import { enPeriodo, type FacturaInf } from "./tipos";

export interface VentaCliente { cliente: string; nif?: string; facturas: number; base: string; total: string; pendiente: string; }
export function ventasPorCliente(fs: FacturaInf[], desde: string, hasta: string): VentaCliente[] {
  const m = new Map<string, { cliente: string; nif?: string; n: number; base: Dec; total: Dec; pend: Dec }>();
  for (const f of fs) {
    if (f.anulada || !enPeriodo(f.fechaExpedicion, desde, hasta)) continue;
    const d = f.datos.destinatarios?.[0];
    const k = d?.nif ?? d?.idOtro?.id ?? d?.nombre ?? "(sin identificar)";
    const x = m.get(k) ?? { cliente: d?.nombre ?? "Ventas simplificadas", nif: d?.nif, n: 0, base: D(0), total: D(0), pend: D(0) };
    x.n++; x.base = x.base.add(f.totales.baseTotal); x.total = x.total.add(f.totales.importeTotal);
    if (f.estadoCobro !== "cobrada") x.pend = x.pend.add(f.totales.totalAPagar);
    m.set(k, x);
  }
  return [...m.values()].sort((a, b) => b.base.cmp(a.base)).map((x) => ({ cliente: x.cliente, nif: x.nif, facturas: x.n, base: x.base.toFixed(2), total: x.total.toFixed(2), pendiente: x.pend.toFixed(2) }));
}
export function ventasPorMes(fs: FacturaInf[], anio: number): { mes: number; base: string }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const p = `${anio}-${String(i + 1).padStart(2, "0")}`;
    return { mes: i + 1, base: sum(fs.filter((f) => !f.anulada && f.fechaExpedicion.startsWith(p)).map((f) => D(f.totales.baseTotal))).toFixed(2) };
  });
}
