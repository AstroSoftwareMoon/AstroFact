/**
 * Pago fraccionado del IRPF en estimación directa — AYUDA ORIENTATIVA para el modelo 130, no lo presenta.
 * Art. 110.1.a) RIRPF (RD 439/2007): 20 % del rendimiento neto desde el 1 de enero hasta el fin del trimestre,
 * menos los pagos fraccionados de trimestres anteriores; art. 110.3.a): menos retenciones e ingresos a cuenta
 * acumulados (actividades profesionales). Art. 30.2.ª: en directa simplificada, gastos de difícil
 * justificación del 5 % del rendimiento neto, con un máximo de 2.000 € anuales.
 * No contempla: amortizaciones, deducción del art. 110.3.c), reducción del art. 110.2 ni estimación objetiva.
 */
import { D, Dec, sum } from "@astrofact/fiscal-core";
import { trimestreRango, type FacturaInf, type GastoInf } from "./tipos";

export interface OpcionesPago130 {
  anio: number; trimestre: 1 | 2 | 3 | 4;
  /** Pagos fraccionados ya ingresados en trimestres anteriores del mismo año. */
  pagosAnteriores?: string;
  /** Estimación directa simplificada (aplica el 5 % de gastos de difícil justificación). */
  simplificada?: boolean;
  /** Actividad profesional: se restan las retenciones soportadas acumuladas (art. 110.3.a). */
  profesional?: boolean;
  /** Otros gastos deducibles del periodo no registrados como gastos (cuotas de autónomos, amortizaciones…). */
  otrosGastos?: string;
}
export interface Pago130 {
  desde: string; hasta: string; ingresos: string; gastos: string; difJustificacion: string; rendimientoNeto: string;
  veintePorCiento: string; retenciones: string; pagosAnteriores: string; resultado: string; aIngresar: string; notas: string[];
}
const f2 = (d: Dec) => d.toFixed(2);

export function pagoFraccionado130(fs: FacturaInf[], gs: GastoInf[], o: OpcionesPago130): Pago130 {
  const desde = `${o.anio}-01-01`, hasta = trimestreRango(o.anio, o.trimestre).hasta;
  const dentro = (iso: string) => iso >= desde && iso <= hasta;
  const vivas = fs.filter((f) => !f.anulada && dentro(f.fechaOperacion ?? f.fechaExpedicion));
  const ingresos = sum(vivas.map((f) => D(f.totales.baseTotal)));
  const gastosReg = sum(gs.filter((g) => dentro(g.fecha)).map((g) => {
    const pct = D(g.pctDeducible).div(100, 6);
    // Base deducible más la parte de IVA no deducible (mayor gasto) y el recargo soportado
    const ivaNoDed = sum(g.desglose.map((d) => D(d.cuota).sub(D(d.cuota).mul(pct).round(2)).add(d.cuotaRecargo)));
    return D(g.baseTotal).mul(pct).round(2).add(g.inversionSujetoPasivo ? D(0) : ivaNoDed);
  }));
  const gastos = gastosReg.add(o.otrosGastos ?? "0");
  const previo = ingresos.sub(gastos);
  let dif = D(0);
  if (o.simplificada && previo.sign() > 0) { dif = previo.mul("0.05").round(2); if (dif.cmp("2000") > 0) dif = D("2000"); }
  const rn = previo.sub(dif);
  const veinte = rn.sign() > 0 ? rn.mul("0.20").round(2) : D(0);
  const ret = o.profesional === false ? D(0) : sum(vivas.map((f) => D(f.totales.retencion)));
  const ant = D(o.pagosAnteriores ?? "0");
  const res = veinte.sub(ret).sub(ant);
  return {
    desde, hasta, ingresos: f2(ingresos), gastos: f2(gastos), difJustificacion: f2(dif), rendimientoNeto: f2(rn), veintePorCiento: f2(veinte),
    retenciones: f2(ret), pagosAnteriores: f2(ant), resultado: f2(res), aIngresar: f2(res.sign() > 0 ? res : D(0)),
    notas: [
      "Orientativo: no incluye amortizaciones salvo que las indiques en «otros gastos», ni la minoración del art. 110.3.c) RIRPF.",
      "La cuota de autónomos (RETA) es gasto deducible: añádela en «otros gastos» si no la registras como gasto.",
      ...(res.sign() < 0 ? ["Resultado negativo: el modelo 130 se presenta con resultado cero (o a deducir en trimestres siguientes)."] : []),
    ],
  };
}
