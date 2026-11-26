/** Puente entre los datos del store y @astrofact/informes (hojas, paquete para el gestor, Facturae). */
import { aCsv, aXlsx, crearZip, generarFacturae, libroEmitidas, libroRecibidas, pagoFraccionado130, resumenIva, ventasPorCliente, type Hoja, type OpcionesPago130, type Pago130, type ResumenIva } from "@astrofact/informes";
import type { AstroFactStore, Factura, Obligado } from "@astrofact/db";
import { pdfDeFactura } from "./pdf";

export const hojaIva = (r: ResumenIva): Hoja => ({ nombre: "Resumen IVA", columnas: ["Concepto", "Tipo %", "Base", "Cuota"], anchos: [46, 10, 14, 14], filas: [
  ...r.devengado.map((l) => ["IVA devengado", Number(l.tipo), Number(l.base), Number(l.cuota)]),
  ...r.recargoDevengado.map((l) => ["Recargo de equivalencia devengado", Number(l.tipo), Number(l.base), Number(l.cuota)]),
  ...(Number(r.inversionSujetoPasivo.base) ? [["Adquisiciones con inversión del sujeto pasivo", null, Number(r.inversionSujetoPasivo.base), Number(r.inversionSujetoPasivo.cuota)]] : []),
  ...r.exentasYNoSujetas.map((e) => [e.concepto, null, Number(e.base), null]),
  ...r.deducible.map((l) => ["IVA soportado deducible", Number(l.tipo), Number(l.base), Number(l.cuota)]),
  ["Total devengado", null, null, Number(r.totalDevengado)], ["Total deducible", null, null, Number(r.totalDeducible)], ["Resultado (orientativo)", null, null, Number(r.resultado)],
  ...r.avisos.map((a) => [`Aviso: ${a}`, null, null, null]),
] });
export const hoja130 = (p: Pago130): Hoja => ({ nombre: "Pago fraccionado 130", columnas: ["Concepto", "Importe"], anchos: [60, 14], filas: [
  [`Periodo acumulado ${p.desde} a ${p.hasta}`, null], ["Ingresos computables", Number(p.ingresos)], ["Gastos deducibles", Number(p.gastos)],
  ["Gastos de difícil justificación (art. 30.2.ª RIRPF)", Number(p.difJustificacion)], ["Rendimiento neto", Number(p.rendimientoNeto)], ["20 % (art. 110.1.a RIRPF)", Number(p.veintePorCiento)],
  ["Retenciones e ingresos a cuenta", Number(p.retenciones)], ["Pagos fraccionados anteriores", Number(p.pagosAnteriores)], ["Resultado (orientativo)", Number(p.resultado)],
  ...p.notas.map((n) => [n, null]),
] });
export const hojaVentas = (store: AstroFactStore, o: Obligado, desde: string, hasta: string): Hoja => ({ nombre: "Ventas por cliente", columnas: ["Cliente", "NIF", "Facturas", "Base", "Total", "Pendiente"], anchos: [40, 14, 10, 14, 14, 14],
  filas: ventasPorCliente(store.facturas(o.id), desde, hasta).map((v) => [v.cliente, v.nif ?? "", v.facturas, Number(v.base), Number(v.total), Number(v.pendiente)]) });

export function informesPeriodo(store: AstroFactStore, o: Obligado, desde: string, hasta: string, op130?: OpcionesPago130) {
  const fs = store.facturas(o.id), gs = store.gastos(o.id);
  return { emitidas: libroEmitidas(fs, desde, hasta), recibidas: libroRecibidas(gs, desde, hasta), iva: resumenIva(fs, gs, desde, hasta), p130: op130 ? pagoFraccionado130(fs, gs, op130) : undefined };
}

const LEEME = (o: Obligado, desde: string, hasta: string) => `Paquete para el asesor — ${o.nombre} (${o.nif})
Periodo: ${desde} a ${hasta}. Generado con AstroFact el ${new Date().toLocaleString("es-ES")}.

Contenido:
  informes.xlsx            Libros de facturas emitidas y recibidas, resumen de IVA, pago fraccionado y ventas por cliente
  libro-emitidas.csv       Mismo libro en CSV (separador ;)
  libro-recibidas.csv
  facturas/                PDF de las facturas emitidas del periodo
  gastos/                  Justificantes adjuntos a los gastos del periodo
  registros/               Registros de facturación (XML conforme al XSD de la AEAT), si se han incluido

IMPORTANTE: los resúmenes de IVA y del pago fraccionado son una AYUDA ORIENTATIVA. AstroFact no presenta
autoliquidaciones ni sustituye el criterio de un asesor fiscal. Revise los modelos oficiales en la sede de la AEAT.
`;

export async function paqueteGestor(store: AstroFactStore, o: Obligado, desde: string, hasta: string, op130: OpcionesPago130 | undefined, opciones: { pdfs: boolean; adjuntos: boolean; registros: boolean }, progreso?: (t: string) => void) {
  const inf = informesPeriodo(store, o, desde, hasta, op130);
  const hojas = [inf.emitidas, inf.recibidas, hojaIva(inf.iva), ...(inf.p130 ? [hoja130(inf.p130)] : []), hojaVentas(store, o, desde, hasta)];
  const ficheros: { nombre: string; contenido: string | Uint8Array }[] = [
    { nombre: "LEEME.txt", contenido: LEEME(o, desde, hasta) }, { nombre: "informes.xlsx", contenido: aXlsx(hojas) },
    { nombre: "libro-emitidas.csv", contenido: aCsv(inf.emitidas) }, { nombre: "libro-recibidas.csv", contenido: aCsv(inf.recibidas) },
  ];
  const seguro = (s: string) => s.replace(/[^\w.-]+/g, "_");
  if (opciones.pdfs) {
    const fs = store.facturas(o.id).filter((f) => f.fechaExpedicion >= desde && f.fechaExpedicion <= hasta);
    const pl = store.plantilla(o.id);
    for (const [i, f] of fs.entries()) { progreso?.(`PDF ${i + 1}/${fs.length}`); ficheros.push({ nombre: `facturas/${seguro(f.numSerie)}.pdf`, contenido: await pdfDeFactura(f, o, pl) }); }
  }
  if (opciones.adjuntos) {
    for (const g of store.gastos(o.id, { desde, hasta }).filter((x) => x.adjuntos > 0)) {
      for (const a of store.adjuntos("gasto", g.id)) { const d = await store.adjuntoDatos(a.id); if (d) ficheros.push({ nombre: `gastos/${g.fecha}_${seguro(g.proveedorNombre)}_${a.id}_${seguro(d.nombre)}`, contenido: d.datos }); }
    }
  }
  if (opciones.registros) {
    // La exportación queda registrada como evento (art. 9 Orden HAC/1177/2024) en modalidad No VERI*FACTU
    try { const ex = await store.exportarRegistros(o.id, desde, hasta); for (const f of ex.ficheros) ficheros.push({ nombre: `registros/${f.nombre}`, contenido: f.contenido }); }
    catch (e) { if (!/No hay registros/.test((e as Error).message)) throw e; }
  }
  return crearZip(ficheros);
}

/** Facturae 3.2.2 sin firmar de una factura emitida. */
export function facturaeDe(store: AstroFactStore, o: Obligado, f: Factura): string {
  const t = f.terceroId ? store.tercero(f.terceroId) : undefined;
  const d = f.datos.destinatarios?.[0];
  return generarFacturae(f, { nombre: o.nombre, nif: o.nif, direccion: o.direccion, email: o.email },
    { nombre: d?.nombre ?? t?.nombre ?? "", nif: d?.nif ?? t?.nif, idOtro: d?.idOtro ? { codigoPais: d.idOtro.codigoPais, id: d.idOtro.id } : t?.idOtro, direccion: t?.direccion, email: t?.email },
    { iban: o.iban, vencimiento: f.vencimiento });
}
