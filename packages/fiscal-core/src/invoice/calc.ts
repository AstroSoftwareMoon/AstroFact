/**
 * Cálculo de importes de factura con aritmética exacta.
 * - Base de línea = round2(cantidad × precio × (1 − dto/100)).
 * - "por-tipo" (defecto): cuota = round2(Σ bases del grupo × tipo/100) por cada grupo de desglose.
 * - "por-linea": cuota redondeada por línea y sumada.
 * - CuotaTotal = Σ(CuotaRepercutida + CuotaRecargoEquivalencia)        (Validaciones AEAT §16)
 * - ImporteTotal = Σ(Base + CuotaRepercutida + CuotaRecargoEquivalencia) (Validaciones AEAT §17)
 * - La retención IRPF NO forma parte de ImporteTotal (FAQ Desarrolladores AEAT, 04/12/2025):
 *   se calcula aparte y solo afecta al "Total a pagar".
 */
import { Dec, D, sum } from "../decimal";
import type { Calificacion, ClaveRegimen, Impuesto, OperacionExenta } from "../constants";
import type { FacturaBorrador, LineaFactura, MetodoRedondeo } from "./types";

export interface LineaCalculada extends LineaFactura { base: Dec; cuota: Dec; cuotaRecargo: Dec; }

export interface GrupoDesglose {
  impuesto: Impuesto;
  claveRegimen?: ClaveRegimen;
  calificacion?: Calificacion;
  exenta?: OperacionExenta;
  tipo?: Dec;
  recargo?: Dec;
  base: Dec;
  cuota: Dec;
  cuotaRecargo: Dec;
}

export interface Totales {
  lineas: LineaCalculada[];
  desglose: GrupoDesglose[];
  baseTotal: Dec;
  cuotaTotal: Dec;
  importeTotal: Dec;
  baseRetencion: Dec;
  retencion: Dec;
  totalAPagar: Dec;
}

const pct = (x: Dec, p: Dec | undefined) => (p ? x.mul(p).div(100, 10) : Dec.zero);

/** ¿La línea lleva cuota (S1)? S2 = inversión del sujeto pasivo: tipo 0 y cuota 0 en el registro. */
function llevaCuota(l: LineaFactura): boolean {
  return !l.exenta && (l.calificacion ?? "S1") === "S1";
}

export function baseLinea(l: LineaFactura): Dec {
  const bruto = D(l.cantidad).mul(D(l.precioUnitario));
  const dto = l.descuentoPct ? bruto.mul(D(l.descuentoPct)).div(100, 10) : Dec.zero;
  return bruto.sub(dto).round(2);
}

function claveGrupo(l: LineaFactura): string {
  const calif = l.exenta ? `E:${l.exenta}` : `C:${l.calificacion ?? "S1"}`;
  const tipo = llevaCuota(l) ? D(l.tipo ?? "0").toPlain() : (l.calificacion === "S2" ? "0" : "");
  const re = llevaCuota(l) && l.recargo ? D(l.recargo).toPlain() : "";
  return [l.impuesto ?? "01", l.claveRegimen ?? "01", calif, tipo, re].join("|");
}

export function calcularTotales(f: Pick<FacturaBorrador, "lineas" | "retencionPct" | "redondeo">): Totales {
  const metodo: MetodoRedondeo = f.redondeo ?? "por-tipo";
  const lineas: LineaCalculada[] = f.lineas.map((l) => {
    const base = baseLinea(l);
    const conCuota = llevaCuota(l);
    return {
      ...l,
      base,
      cuota: conCuota ? pct(base, D(l.tipo ?? "0")).round(2) : Dec.zero,
      cuotaRecargo: conCuota && l.recargo ? pct(base, D(l.recargo)).round(2) : Dec.zero,
    };
  });

  const grupos = new Map<string, { l: LineaCalculada; items: LineaCalculada[] }>();
  for (const l of lineas) {
    const k = claveGrupo(l);
    const g = grupos.get(k);
    if (g) g.items.push(l); else grupos.set(k, { l, items: [l] });
  }

  const desglose: GrupoDesglose[] = [...grupos.values()].map(({ l, items }) => {
    const base = sum(items.map((i) => i.base));
    const conCuota = llevaCuota(l);
    const tipo = conCuota ? D(l.tipo ?? "0") : l.calificacion === "S2" && !l.exenta ? D("0") : undefined;
    const recargo = conCuota && l.recargo ? D(l.recargo) : undefined;
    const cuota = !conCuota ? Dec.zero : metodo === "por-linea" ? sum(items.map((i) => i.cuota)) : pct(base, tipo).round(2);
    const cuotaRecargo = !recargo ? Dec.zero : metodo === "por-linea" ? sum(items.map((i) => i.cuotaRecargo)) : pct(base, recargo).round(2);
    return {
      impuesto: l.impuesto ?? "01",
      claveRegimen: l.claveRegimen ?? "01",
      calificacion: l.exenta ? undefined : l.calificacion ?? "S1",
      exenta: l.exenta,
      tipo, recargo, base, cuota, cuotaRecargo,
    };
  });

  const baseTotal = sum(desglose.map((g) => g.base));
  const cuotaTotal = sum(desglose.map((g) => g.cuota.add(g.cuotaRecargo)));
  const importeTotal = baseTotal.add(cuotaTotal);
  const retPct = f.retencionPct ? D(f.retencionPct) : undefined;
  const baseRetencion = retPct ? sum(lineas.filter((l) => l.sujetaRetencion !== false).map((l) => l.base)) : Dec.zero;
  const retencion = retPct ? pct(baseRetencion, retPct).round(2) : Dec.zero;
  return { lineas, desglose, baseTotal, cuotaTotal, importeTotal, baseRetencion, retencion, totalAPagar: importeTotal.sub(retencion) };
}
