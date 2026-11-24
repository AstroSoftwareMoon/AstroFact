import { calcularTotales, urlQr, type FacturaBorrador } from "@astrofact/fiscal-core";
import type { DatosPdf } from "../src";

export function datos(over: Partial<FacturaBorrador> = {}, modo: DatosPdf["modo"] = "no_verifactu"): DatosPdf {
  const f: FacturaBorrador = {
    tipoFactura: "F1", numSerie: "A-2026-0042", fechaExpedicion: "2026-11-22", descripcionOperacion: "Diseño de identidad visual — Ñandú & Cía",
    emisor: { nombre: "Estudio Lunar SL", nif: "89890001K" }, destinatarios: [{ nombre: "Cliente Ejemplo SL", nif: "B12345674", direccion: { linea1: "Av. de las Estrellas 42", cp: "28010", municipio: "Madrid" } }],
    lineas: [{ descripcion: "Diseño de logotipo", cantidad: "1", precioUnitario: "450", tipo: "21" }, { descripcion: "Hora de consultoría", cantidad: "3", precioUnitario: "60", tipo: "21" }],
    retencionPct: "15", ...over,
  };
  const t = calcularTotales(f);
  const s = (x: { toFixed(n: number): string }) => x.toFixed(2);
  return {
    numSerie: f.numSerie, fechaExpedicion: f.fechaExpedicion, tipoFactura: f.tipoFactura, datos: f,
    totales: { baseTotal: s(t.baseTotal), cuotaTotal: s(t.cuotaTotal), importeTotal: s(t.importeTotal), retencion: s(t.retencion), totalAPagar: s(t.totalAPagar),
      desglose: t.desglose.map((g) => ({ impuesto: g.impuesto, calificacion: g.calificacion, exenta: g.exenta, tipo: g.tipo?.toPlain(), recargo: g.recargo?.toPlain(), base: s(g.base), cuota: s(g.cuota), cuotaRecargo: s(g.cuotaRecargo) })),
      lineas: t.lineas.map((l) => ({ base: s(l.base) })) },
    qrUrl: urlQr({ nif: "89890001K", numSerie: f.numSerie, fechaExpedicion: "22-11-2026", importeTotal: t.importeTotal.toFixed(2) }, { entorno: "pruebas", verifactu: modo === "verifactu" }),
    dePruebas: true, anulada: false, modo,
    emisor: { nombre: "Estudio Lunar SL", nif: "89890001K", direccion: { linea1: "C/ de la Luna 7", cp: "28001", municipio: "Madrid" }, iban: "ES91 2100 0418 4502 0005 1332" },
  };
}


export const datosMuestra = (modo: DatosPdf["modo"]) => ({ ...datos({}, modo), dePruebas: false });
