/**
 * Código QR tributario y URL de cotejo.
 * Fuentes: arts. 20 y 21 Orden HAC/1177/2024; AEAT "Detalle de las especificaciones técnicas del
 * código QR…" v0.5.0 (10/12/2025):
 *  - ISO/IEC 18004:2015, nivel de corrección M, tamaño 30×30 a 40×40 mm.
 *  - Zona en blanco ≥ 2 mm (recomendado 6 mm) alrededor.
 *  - Texto "QR tributario:" encima; en VERI*FACTU, debajo "Factura verificable en la sede
 *    electrónica de la AEAT" o "VERI*FACTU".
 *  - URL con 4 parámetros: nif, numserie, fecha (DD-MM-AAAA), importe (punto decimal),
 *    URL-encoding UTF-8 de los valores. Nunca incluir el parámetro "formato" en el QR.
 */
import QRCode from "qrcode";
import { QR_BASE_URL, type Entorno } from "./constants";
import { Dec } from "./decimal";

export interface DatosQr { nif: string; numSerie: string; fechaExpedicion: string /* DD-MM-AAAA */; importeTotal: string; }
export interface OpcionesQr { entorno: Entorno; verifactu: boolean; }

export const QR_LAYOUT = {
  tamanoMinMm: 30,
  tamanoMaxMm: 40,
  tamanoDefectoMm: 35,
  margenMinMm: 2,
  margenRecomendadoMm: 6,
  textoSuperior: "QR tributario:",
  leyendaVerifactu: "Factura verificable en la sede electrónica de la AEAT",
  leyendaVerifactuCorta: "VERI*FACTU",
  nivelCorreccion: "M" as const,
};

/** Formato del importe en la URL: punto decimal, hasta 12 enteros y 2 decimales. */
export function importeQr(v: string): string {
  const s = Dec.of(v).toFixed(2);
  if (!/^-?\d{1,12}\.\d{2}$/.test(s)) throw new RangeError(`Importe no válido para el QR: ${v}`);
  return s;
}

export function urlQr(d: DatosQr, o: OpcionesQr): string {
  if (!/^\d{2}-\d{2}-\d{4}$/.test(d.fechaExpedicion)) throw new RangeError("La fecha del QR debe ser DD-MM-AAAA");
  if (d.numSerie.length > 60) throw new RangeError("numserie admite como máximo 60 caracteres");
  for (const ch of d.numSerie) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) throw new RangeError("numserie solo admite ASCII 32–126"); }
  const base = QR_BASE_URL[o.entorno][o.verifactu ? "verifactu" : "noVerifactu"];
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return `${base}?${[q("nif", d.nif), q("numserie", d.numSerie), q("fecha", d.fechaExpedicion), q("importe", importeQr(d.importeTotal))].join("&")}`;
}

/** Matriz de módulos del QR (true = módulo oscuro), nivel M. */
export function matrizQr(url: string): boolean[][] {
  const qr = QRCode.create(url, { errorCorrectionLevel: QR_LAYOUT.nivelCorreccion });
  const { size, data } = qr.modules;
  const rows: boolean[][] = [];
  for (let y = 0; y < size; y++) { const row: boolean[] = []; for (let x = 0; x < size; x++) row.push(!!data[y * size + x]); rows.push(row); }
  return rows;
}

/** SVG vectorial del QR (sin margen: la zona en blanco la reserva la maquetación del PDF). */
export function svgQr(url: string, sizeMm = QR_LAYOUT.tamanoDefectoMm): string {
  if (sizeMm < QR_LAYOUT.tamanoMinMm || sizeMm > QR_LAYOUT.tamanoMaxMm) throw new RangeError("El QR debe medir entre 30 y 40 mm");
  const m = matrizQr(url);
  const n = m.length;
  let path = "";
  m.forEach((row, y) => row.forEach((on, x) => { if (on) path += `M${x} ${y}h1v1h-1z`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
}
