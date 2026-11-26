/**
 * Resumen trimestral de IVA — AYUDA ORIENTATIVA para preparar la autoliquidación (modelo 303), no la presenta.
 * No se asignan números de casilla: consulte el diseño oficial vigente del modelo 303 en la sede de la AEAT.
 * Criterio de devengo: fecha de expedición (o de operación si consta). TODO(normativa #15): criterio de caja (clave 07).
 */
import { D, sum, type Dec } from "@astrofact/fiscal-core";
import { enPeriodo, type FacturaInf, type GastoInf } from "./tipos";

export interface LineaIva { tipo: string; base: string; cuota: string; }
export interface ResumenIva {
  desde: string; hasta: string;
  devengado: LineaIva[]; recargoDevengado: LineaIva[];
  inversionSujetoPasivo: { base: string; cuota: string };            // adquisiciones con ISP (se devenga y se deduce)
  exentasYNoSujetas: { concepto: string; base: string }[];
  deducible: LineaIva[]; cuotaNoDeducible: string;
  totalDevengado: string; totalDeducible: string; resultado: string;
  avisos: string[];
}
const f2 = (d: Dec) => d.toFixed(2);

export function resumenIva(fs: FacturaInf[], gs: GastoInf[], desde: string, hasta: string): ResumenIva {
  const dev = new Map<string, { base: Dec; cuota: Dec }>(), re = new Map<string, { base: Dec; cuota: Dec }>(), exentas = new Map<string, Dec>();
  const avisos: string[] = [];
  for (const f of fs) {
    if (f.anulada || !enPeriodo(f.fechaOperacion ?? f.fechaExpedicion, desde, hasta)) continue;
    for (const g of f.totales.desglose) {
      if (g.impuesto !== "01") { avisos.push(`La factura ${f.numSerie} incluye ${g.impuesto === "03" ? "IGIC" : g.impuesto === "02" ? "IPSI" : "otros impuestos"}: no se suma al resumen de IVA.`); continue; }
      if (g.exenta || g.calificacion?.startsWith("N") || g.calificacion === "S2") {
        const k = g.exenta ? `Exentas (${g.exenta})` : g.calificacion === "S2" ? "Entregas con inversión del sujeto pasivo" : `No sujetas (${g.calificacion})`;
        exentas.set(k, (exentas.get(k) ?? D(0)).add(g.base)); continue;
      }
      const t = D(g.tipo ?? "0").toPlain();
      const x = dev.get(t) ?? { base: D(0), cuota: D(0) }; dev.set(t, { base: x.base.add(g.base), cuota: x.cuota.add(g.cuota) });
      if (g.recargo) { const r = D(g.recargo).toPlain(); const y = re.get(r) ?? { base: D(0), cuota: D(0) }; re.set(r, { base: y.base.add(g.base), cuota: y.cuota.add(g.cuotaRecargo) }); }
    }
  }
  const ded = new Map<string, { base: Dec; cuota: Dec }>(); let noDed = D(0); let ispBase = D(0), ispCuota = D(0);
  for (const g of gs) {
    if (!enPeriodo(g.fecha, desde, hasta)) continue;
    const pct = D(g.pctDeducible).div(100, 6);
    for (const d of g.desglose) {
      let cuota = D(d.cuota);
      if (g.inversionSujetoPasivo) { cuota = D(d.base).mul(d.tipo).div(100, 6).round(2); ispBase = ispBase.add(d.base); ispCuota = ispCuota.add(cuota); }
      const deducible = cuota.mul(pct).round(2);
      noDed = noDed.add(cuota.sub(deducible)).add(d.cuotaRecargo); // el recargo soportado no es deducible
      const t = D(d.tipo).toPlain(); const x = ded.get(t) ?? { base: D(0), cuota: D(0) };
      ded.set(t, { base: x.base.add(D(d.base).mul(pct).round(2)), cuota: x.cuota.add(deducible) });
    }
  }
  const lineas = (m: Map<string, { base: Dec; cuota: Dec }>) => [...m].sort((a, b) => Number(b[0]) - Number(a[0])).map(([tipo, v]) => ({ tipo, base: f2(v.base), cuota: f2(v.cuota) }));
  const totalDev = sum([...dev.values()].map((v) => v.cuota)).add(sum([...re.values()].map((v) => v.cuota))).add(ispCuota);
  const totalDed = sum([...ded.values()].map((v) => v.cuota));
  return {
    desde, hasta, devengado: lineas(dev), recargoDevengado: lineas(re), inversionSujetoPasivo: { base: f2(ispBase), cuota: f2(ispCuota) },
    exentasYNoSujetas: [...exentas].map(([concepto, base]) => ({ concepto, base: f2(base) })),
    deducible: lineas(ded), cuotaNoDeducible: f2(noDed), totalDevengado: f2(totalDev), totalDeducible: f2(totalDed), resultado: f2(totalDev.sub(totalDed)),
    avisos: [...new Set(avisos)],
  };
}
