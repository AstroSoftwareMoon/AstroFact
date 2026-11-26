/**
 * Libros registro de IVA (art. 62–64 Reglamento del IVA, RD 1624/1992) en formato de hoja de cálculo.
 * Orientativos: una fila por cada tipo impositivo de cada factura. Las facturas anuladas no se incluyen.
 */
import { D } from "@astrofact/fiscal-core";
import { enPeriodo, type FacturaInf, type GastoInf, type Hoja } from "./tipos";

const n = (s: string | undefined) => (s === undefined || s === "" ? null : Number(D(s).toFixed(2)));
const fecha = (iso?: string) => (iso ? iso.split("-").reverse().join("/") : "");
const etiqueta = (g: { exenta?: string; calificacion?: string; impuesto: string }) => g.exenta ? `Exenta ${g.exenta}` : g.calificacion === "S2" ? "Inversión sujeto pasivo" : g.calificacion?.startsWith("N") ? `No sujeta ${g.calificacion}` : g.impuesto === "03" ? "IGIC" : g.impuesto === "02" ? "IPSI" : "IVA";

export function libroEmitidas(fs: FacturaInf[], desde: string, hasta: string): Hoja {
  const filas: Hoja["filas"] = [];
  for (const f of fs.filter((x) => !x.anulada && enPeriodo(x.fechaExpedicion, desde, hasta)).sort((a, b) => a.fechaExpedicion.localeCompare(b.fechaExpedicion) || a.numSerie.localeCompare(b.numSerie))) {
    const dst = f.datos.destinatarios?.[0];
    f.totales.desglose.forEach((g, i) => filas.push([
      fecha(f.fechaExpedicion), fecha(f.fechaOperacion), f.numSerie, f.tipoFactura, dst?.nombre ?? "(simplificada)", dst?.nif ?? dst?.idOtro?.id ?? "",
      etiqueta(g), g.tipo ? Number(g.tipo) : null, n(g.base), n(g.cuota), g.recargo ? Number(g.recargo) : null, n(g.cuotaRecargo),
      i === 0 ? n(f.totales.importeTotal) : null, i === 0 ? n(f.totales.retencion) : null,
    ]));
  }
  return { nombre: "Facturas emitidas", columnas: ["Fecha expedición", "Fecha operación", "Número", "Tipo", "Destinatario", "NIF", "Régimen", "Tipo %", "Base imponible", "Cuota", "RE %", "Cuota RE", "Total factura", "Retención IRPF"], filas, anchos: [12, 12, 16, 6, 30, 14, 18, 7, 13, 11, 6, 10, 13, 12] };
}

export function libroRecibidas(gs: GastoInf[], desde: string, hasta: string): Hoja {
  const filas: Hoja["filas"] = [];
  let orden = 0;
  for (const g of gs.filter((x) => enPeriodo(x.fecha, desde, hasta)).sort((a, b) => a.fecha.localeCompare(b.fecha))) {
    orden++;
    g.desglose.forEach((d, i) => filas.push([
      orden, fecha(g.fecha), g.numero ?? "", g.proveedorNombre, g.proveedorNif ?? "", g.concepto, g.categoria, Number(d.tipo), n(d.base), n(d.cuota),
      d.recargo ? Number(d.recargo) : null, n(d.cuotaRecargo), Number(g.pctDeducible), g.inversionSujetoPasivo ? "Sí" : "", i === 0 ? n(g.total) : null, i === 0 ? n(g.retencion) : null,
    ]));
  }
  return { nombre: "Facturas recibidas", columnas: ["Nº orden", "Fecha", "Número", "Proveedor", "NIF", "Concepto", "Categoría", "Tipo %", "Base imponible", "Cuota soportada", "RE %", "Cuota RE", "% deducible", "ISP", "Total", "Retención"], filas, anchos: [8, 12, 14, 28, 14, 28, 18, 7, 13, 13, 6, 10, 10, 5, 12, 10] };
}
