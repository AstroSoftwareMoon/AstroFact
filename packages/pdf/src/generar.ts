/**
 * Factura PDF vectorial (A4). Requisitos del QR (art. 20–21 Orden HAC/1177/2024; doc. AEAT QR v0.5.0 §2–3):
 *  - Primer elemento de la primera página, arriba y centrado; solo una vez aunque haya varias páginas.
 *  - 35 mm (rango 30–40), nivel de corrección M, módulos vectoriales negros sobre blanco.
 *  - Zona en blanco de 6 mm (recomendada; mínimo 2 mm) alrededor.
 *  - «QR tributario:» encima y, en VERI*FACTU, «Factura verificable en la sede electrónica de la AEAT»
 *    debajo, con tamaño de letra igual o superior al del resto de datos.
 */
import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { matrizQr, QR_LAYOUT, TIPO_FACTURA, type TipoFactura } from "@astrofact/fiscal-core";
import { PLANTILLA_DEFECTO, TEMAS, type DatosPdf, type Plantilla, type Tema } from "./types";

export const MM = 72 / 25.4;
const A4 = { w: 595.28, h: 841.89 };
const M = { x: 16 * MM, top: 12 * MM, bottom: 16 * MM };
const CUERPO = 9;            // tamaño del texto general
const ETIQUETA_QR = 10;      // ≥ cuerpo (especificación)
const NEGRO = rgb(0.07, 0.07, 0.09), GRIS = rgb(0.42, 0.44, 0.5), LINEA = rgb(0.86, 0.87, 0.9), BLANCO = rgb(1, 1, 1);

const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
const euros = (v: string | number) => eur.format(Number(v)).replace(/ /g, " ").replace(/ /g, " ");
const fecha = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : "");

function hex(c: string): RGB {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(c.trim());
  if (!m) return rgb(0.42, 0.39, 1);
  return rgb(parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255);
}
const mezcla = (c: RGB, t: number): RGB => rgb(1 - (1 - c.red) * t, 1 - (1 - c.green) * t, 1 - (1 - c.blue) * t);

/** Sustituye caracteres no representables en WinAnsi (fuentes estándar del PDF). */
function seguro(f: PDFFont, s: string): string {
  let out = "";
  for (const ch of s.replace(/[‘’]/g, "'").replace(/[“”«»]/g, '"').replace(/ | /g, " ")) {
    try { f.encodeText(ch); out += ch; } catch { out += "?"; }
  }
  return out;
}
function partir(f: PDFFont, size: number, texto: string, ancho: number): string[] {
  const out: string[] = [];
  for (const par of seguro(f, texto).split(/\n/)) {
    let linea = "";
    for (const w of par.split(/\s+/)) {
      const cand = linea ? `${linea} ${w}` : w;
      if (f.widthOfTextAtSize(cand, size) <= ancho) linea = cand;
      else { if (linea) out.push(linea); linea = w; while (f.widthOfTextAtSize(linea, size) > ancho && linea.length > 1) { let k = linea.length; while (k > 1 && f.widthOfTextAtSize(linea.slice(0, k), size) > ancho) k--; out.push(linea.slice(0, k)); linea = linea.slice(k); } }
    }
    out.push(linea);
  }
  return out;
}

interface Ctx { doc: PDFDocument; reg: PDFFont; bold: PDFFont; mono: PDFFont; acento: RGB; p: Plantilla; d: DatosPdf; tema: Tema; }

const OSCURO = rgb(0.13, 0.14, 0.17);

function texto(page: PDFPage, c: Ctx, s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "right" | "center"; width?: number } = {}) {
  const font = o.font ?? c.reg, size = o.size ?? CUERPO, t = seguro(font, s);
  const w = font.widthOfTextAtSize(t, size);
  const xx = o.align === "right" ? x - w : o.align === "center" ? x - w / 2 : x;
  page.drawText(t, { x: xx, y, size, font, color: o.color ?? NEGRO });
  return w;
}

function marcaAgua(page: PDFPage, c: Ctx) {
  if (!c.d.dePruebas && !c.d.anulada) return;
  const s = c.d.anulada ? "ANULADA" : "PRUEBAS - SIN VALIDEZ";
  const size = 58, w = c.bold.widthOfTextAtSize(s, size);
  page.drawText(s, { x: A4.w / 2 - (w / 2) * Math.cos(Math.PI / 6.5), y: A4.h / 2 - (w / 2) * Math.sin(Math.PI / 6.5), size, font: c.bold, color: rgb(0.85, 0.85, 0.87), rotate: degrees(28), opacity: 0.45 });
}

/** Dibuja el bloque del QR tributario y devuelve la coordenada y bajo él. */
export function bloqueQr(page: PDFPage, c: Ctx, yTop: number) {
  if (!c.d.qrUrl || c.d.modo === "sin_registros") return { y: yTop, qr: undefined };
  const lado = QR_LAYOUT.tamanoDefectoMm * MM, zona = QR_LAYOUT.margenRecomendadoMm * MM;
  let y = yTop - ETIQUETA_QR;
  texto(page, c, QR_LAYOUT.textoSuperior, A4.w / 2, y, { size: ETIQUETA_QR, font: c.bold, align: "center" });
  y -= 3 * MM;
  const x0 = A4.w / 2 - lado / 2, yQrTop = y - zona;
  // zona en blanco explícita (por si la plantilla tuviera fondo)
  page.drawRectangle({ x: x0 - zona, y: yQrTop - lado - zona, width: lado + 2 * zona, height: lado + 2 * zona, color: BLANCO });
  const m = matrizQr(c.d.qrUrl), n = m.length, mod = lado / n;
  for (let r = 0; r < n; r++) {
    let run = -1;
    for (let k = 0; k <= n; k++) {
      const on = k < n && m[r]![k];
      if (on && run < 0) run = k;
      if (!on && run >= 0) { page.drawRectangle({ x: x0 + run * mod, y: yQrTop - (r + 1) * mod, width: (k - run) * mod + 0.01, height: mod + 0.01, color: rgb(0, 0, 0) }); run = -1; }
    }
  }
  y = yQrTop - lado - zona;
  if (c.d.modo === "verifactu") {
    for (const l of partir(c.bold, ETIQUETA_QR, QR_LAYOUT.leyendaVerifactu, 320)) { y -= ETIQUETA_QR + 1; texto(page, c, l, A4.w / 2, y, { size: ETIQUETA_QR, font: c.bold, align: "center" }); }
    y -= 2 * MM;
  }
  return { y, qr: { x: x0, y: yQrTop - lado, lado } };
}

function cabeceraContinuacion(page: PDFPage, c: Ctx) {
  const y = A4.h - M.top - 4;
  texto(page, c, `${c.d.emisor.nombre} · Factura ${c.d.numSerie} (continuación)`, M.x, y, { size: 8.5, color: GRIS });
  page.drawLine({ start: { x: M.x, y: y - 6 }, end: { x: A4.w - M.x, y: y - 6 }, thickness: 0.6, color: LINEA });
  return y - 18;
}

const COLS = (ancho: number) => {
  const imp = 92, base = 70, dto = 34, precio = 64, cant = 40;
  const desc = ancho - imp - base - dto - precio - cant;
  return { desc, cant, precio, dto, imp, base };
};

export async function generarFacturaPdf(d: DatosPdf, plantilla: Partial<Plantilla> = {}): Promise<Uint8Array> {
  const p: Plantilla = { ...PLANTILLA_DEFECTO, ...plantilla };
  const doc = await PDFDocument.create();
  doc.setTitle(`Factura ${d.numSerie}`); doc.setAuthor(d.emisor.nombre); doc.setSubject(d.datos.descripcionOperacion);
  doc.setCreator("AstroFact"); doc.setProducer("AstroFact (pdf-lib)"); doc.setLanguage("es-ES");
  doc.setCreationDate(new Date(`${d.fechaExpedicion}T12:00:00Z`)); doc.setModificationDate(new Date(`${d.fechaExpedicion}T12:00:00Z`));
  const tema = TEMAS[p.estilo] ?? TEMAS.moderna;
  const F = tema.fuente === "serif" ? [StandardFonts.TimesRoman, StandardFonts.TimesRomanBold] : tema.fuente === "mono" ? [StandardFonts.Courier, StandardFonts.CourierBold] : [StandardFonts.Helvetica, StandardFonts.HelveticaBold];
  const c: Ctx = { doc, reg: await doc.embedFont(F[0]!), bold: await doc.embedFont(F[1]!), mono: await doc.embedFont(StandardFonts.Courier), acento: hex(p.colorAcento), p, d, tema };
  const anchoUtil = A4.w - 2 * M.x;
  const paginas: PDFPage[] = [];
  const nueva = () => {
    const pg = doc.addPage([A4.w, A4.h]); paginas.push(pg);
    if (tema.banda) pg.drawRectangle({ x: 0, y: 0, width: 5 * MM, height: A4.h, color: c.acento });
    marcaAgua(pg, c); return pg;
  };

  // ---------- Página 1: QR tributario primero ----------
  let page = nueva();
  let { y } = bloqueQr(page, c, A4.h - M.top);
  if (y < A4.h - M.top) {   // separador bajo el QR
    if (tema.separador === "acento") page.drawLine({ start: { x: M.x, y }, end: { x: A4.w - M.x, y }, thickness: 1.4, color: c.acento });
    else if (tema.separador === "fino") page.drawLine({ start: { x: M.x, y }, end: { x: A4.w - M.x, y }, thickness: 0.7, color: LINEA });
    else if (tema.separador === "doble") for (const dy of [0, 2.5]) page.drawLine({ start: { x: M.x, y: y - dy }, end: { x: A4.w - M.x, y: y - dy }, thickness: dy ? 0.4 : 1, color: tema.tituloAcento ? c.acento : NEGRO });
    y -= 6 * MM;
  }

  // Emisor (izquierda, con logo) y datos de la factura (derecha)
  let yIzq = y;
  if (p.logo) {
    try {
      const img = p.logo.tipo === "png" ? await doc.embedPng(p.logo.bytes) : await doc.embedJpg(p.logo.bytes);
      const s = img.scaleToFit(42 * MM, 16 * MM);
      page.drawImage(img, { x: M.x, y: yIzq - s.height, width: s.width, height: s.height });
      yIzq -= s.height + 3 * MM;
    } catch { /* logo no válido: se omite */ }
  }
  texto(page, c, d.emisor.nombre, M.x, yIzq - 12, { size: 13, font: c.bold }); yIzq -= 12 + 5;
  const dir = d.emisor.direccion;
  for (const l of [`NIF ${d.emisor.nif}`, dir?.linea1, [dir?.cp, dir?.municipio].filter(Boolean).join(" "), [dir?.provincia, dir?.pais].filter(Boolean).join(", "), d.emisor.email, d.emisor.telefono].filter(Boolean) as string[]) {
    yIzq -= CUERPO + 3; texto(page, c, l, M.x, yIzq, { color: GRIS });
  }
  const clase = d.tipoFactura.startsWith("R") ? "FACTURA RECTIFICATIVA" : d.tipoFactura === "F2" ? "FACTURA SIMPLIFICADA" : "FACTURA";
  let yDer = y;
  const xr = A4.w - M.x;
  texto(page, c, clase, xr, yDer - 8, { size: 8, font: c.bold, color: tema.tituloAcento ? c.acento : GRIS, align: "right" }); yDer -= 8 + 6;
  texto(page, c, d.numSerie, xr, yDer - 18, { size: 18, font: c.bold, align: "right" }); yDer -= 18 + 6;
  for (const [k, v] of [["Fecha de expedición", fecha(d.fechaExpedicion)], ["Fecha de operación", d.fechaOperacion ? fecha(d.fechaOperacion) : ""], ["Vencimiento", d.vencimiento ? fecha(d.vencimiento) : ""]] as const) {
    if (!v) continue; yDer -= CUERPO + 3; texto(page, c, `${k}: ${v}`, xr, yDer, { color: GRIS, align: "right" });
  }
  y = Math.min(yIzq, yDer) - 7 * MM;

  // Destinatario
  const dest = d.datos.destinatarios?.[0];
  if (dest) {
    const h = 15 * MM;
    if (tema.cliente === "tinte") page.drawRectangle({ x: M.x, y: y - h, width: anchoUtil, height: h, color: mezcla(c.acento, 0.07) });
    else if (tema.cliente === "borde") page.drawRectangle({ x: M.x, y: y - h, width: anchoUtil, height: h, borderColor: tema.fuente === "sans" ? LINEA : mezcla(c.acento, 0.5), borderWidth: 0.6 });
    else if (tema.cliente === "barra") { page.drawRectangle({ x: M.x, y: y - h, width: anchoUtil, height: h, color: rgb(0.97, 0.97, 0.975) }); page.drawRectangle({ x: M.x, y: y - h, width: 1.2 * MM, height: h, color: c.acento }); }
    const xi = M.x + (tema.cliente === "nada" ? 0 : 4 * MM);
    texto(page, c, "CLIENTE", xi, y - 4 * MM - 2, { size: 7, font: c.bold, color: GRIS });
    texto(page, c, dest.nombre, xi, y - 4 * MM - 13, { size: 10.5, font: c.bold });
    const id = dest.nif ? `NIF ${dest.nif}` : dest.idOtro ? `${dest.idOtro.codigoPais ?? ""} ${dest.idOtro.id}`.trim() : "";
    const dd = dest.direccion; const direc = [dd?.linea1, [dd?.cp, dd?.municipio].filter(Boolean).join(" "), dd?.provincia].filter(Boolean).join(" · ");
    texto(page, c, [id, direc].filter(Boolean).join("   ·   "), xi, y - 4 * MM - 25, { color: GRIS });
    y -= h + 5 * MM;
  }
  if (d.datos.rectificacion) {
    const r = d.datos.rectificacion;
    for (const l of partir(c.reg, CUERPO, `Rectifica a: ${r.facturas.map((f) => `${f.NumSerieFactura} (${f.FechaExpedicionFactura})`).join(", ")} · ${r.tipo === "S" ? "por sustitución" : "por diferencias"} · ${TIPO_FACTURA[d.tipoFactura as TipoFactura] ?? d.tipoFactura}`, anchoUtil)) { texto(page, c, l, M.x, y, { color: GRIS }); y -= CUERPO + 3; }
    y -= 2 * MM;
  }
  for (const l of partir(c.reg, CUERPO, `Concepto: ${d.datos.descripcionOperacion}`, anchoUtil)) { texto(page, c, l, M.x, y); y -= CUERPO + 3; }
  y -= 3 * MM;

  // ---------- Tabla de líneas (multipágina) ----------
  const col = COLS(anchoUtil);
  const xs = { desc: M.x, cant: M.x + col.desc + col.cant, precio: M.x + col.desc + col.cant + col.precio, dto: M.x + col.desc + col.cant + col.precio + col.dto, imp: M.x + col.desc + col.cant + col.precio + col.dto + col.imp, base: A4.w - M.x };
  const cabTabla = () => {
    const h = 18;
    const relleno = tema.cabTabla === "relleno" || tema.cabTabla === "oscuro";
    if (relleno) page.drawRectangle({ x: M.x, y: y - h + 5, width: anchoUtil, height: h, color: tema.cabTabla === "oscuro" ? OSCURO : c.acento });
    const col2 = relleno ? BLANCO : tema.cabTabla === "doble" && tema.tituloAcento ? c.acento : GRIS, pad = relleno ? 5 : 0;
    texto(page, c, "DESCRIPCIÓN", xs.desc + pad, y - 7, { size: 7, font: c.bold, color: col2 });
    texto(page, c, "CANT.", xs.cant, y - 7, { size: 7, font: c.bold, color: col2, align: "right" });
    texto(page, c, "PRECIO", xs.precio, y - 7, { size: 7, font: c.bold, color: col2, align: "right" });
    texto(page, c, "DTO.", xs.dto, y - 7, { size: 7, font: c.bold, color: col2, align: "right" });
    texto(page, c, "IMPUESTO", xs.imp, y - 7, { size: 7, font: c.bold, color: col2, align: "right" });
    texto(page, c, "BASE", xs.base - pad, y - 7, { size: 7, font: c.bold, color: col2, align: "right" });
    if (tema.cabTabla === "linea" || tema.cabTabla === "lineaNegra") page.drawLine({ start: { x: M.x, y: y - 11 }, end: { x: A4.w - M.x, y: y - 11 }, thickness: 0.8, color: tema.cabTabla === "lineaNegra" ? NEGRO : LINEA });
    if (tema.cabTabla === "doble") for (const yy of [y + 4, y - 11]) page.drawLine({ start: { x: M.x, y: yy }, end: { x: A4.w - M.x, y: yy }, thickness: 0.7, color: NEGRO });
    y -= h + 2;
  };
  cabTabla();
  const etiquetaImp = (l: DatosPdf["datos"]["lineas"][number]) => l.exenta ? `Exenta ${l.exenta}` : l.calificacion === "S2" ? "ISP" : l.calificacion?.startsWith("N") ? "No sujeta" : `${l.impuesto === "03" ? "IGIC" : l.impuesto === "02" ? "IPSI" : "IVA"} ${l.tipo}%${l.recargo ? ` +RE ${l.recargo}%` : ""}`;
  d.datos.lineas.forEach((l, i) => {
    const lineas = partir(c.reg, CUERPO, l.descripcion, col.desc - 8);
    const h = lineas.length * (CUERPO + 2.5) + 6;
    if (y - h < M.bottom + 12 * MM) { page = nueva(); y = cabeceraContinuacion(page, c); cabTabla(); }
    const pad = tema.cabTabla === "relleno" || tema.cabTabla === "oscuro" ? 5 : 0;
    if (tema.zebra && i % 2 === 1) page.drawRectangle({ x: M.x, y: y - h + 1, width: anchoUtil, height: h, color: mezcla(c.acento, 0.05) });
    lineas.forEach((t, k) => texto(page, c, t, xs.desc + pad, y - (CUERPO + 2.5) * (k + 1) + 2));
    const yb = y - CUERPO - 0.5;
    texto(page, c, l.cantidad.replace(".", ","), xs.cant, yb, { align: "right" });
    texto(page, c, euros(l.precioUnitario), xs.precio, yb, { align: "right" });
    texto(page, c, l.descuentoPct ? `${l.descuentoPct}%` : "", xs.dto, yb, { align: "right" });
    texto(page, c, etiquetaImp(l), xs.imp, yb, { align: "right", size: 8, color: GRIS });
    texto(page, c, euros(d.totales.lineas[i]?.base ?? 0), xs.base - pad, yb, { align: "right" });
    y -= h;
    page.drawLine({ start: { x: M.x, y: y + 1 }, end: { x: A4.w - M.x, y: y + 1 }, thickness: 0.4, color: LINEA });
  });

  // ---------- Totales ----------
  const t = d.totales;
  const filas: [string, string, "n" | "b" | "g"][] = [];
  for (const g of t.desglose) filas.push([`Base ${g.exenta ? `exenta ${g.exenta}` : g.calificacion === "S2" ? "ISP" : g.calificacion?.startsWith("N") ? "no sujeta" : `${g.tipo}%`}`, euros(g.base), "g"]);
  for (const g of t.desglose) if (Number(g.cuota) !== 0) filas.push([`${g.impuesto === "03" ? "IGIC" : g.impuesto === "02" ? "IPSI" : "IVA"} ${g.tipo}%`, euros(g.cuota), "g"]);
  for (const g of t.desglose) if (Number(g.cuotaRecargo) !== 0) filas.push([`Recargo de equivalencia ${g.recargo}%`, euros(g.cuotaRecargo), "g"]);
  filas.push(["Importe total factura", euros(t.importeTotal), "b"]);
  if (Number(t.retencion) !== 0) { filas.push([`Retención IRPF ${d.datos.retencionPct}%`, `-${euros(t.retencion)}`, "g"]); filas.push(["Total a pagar", euros(t.totalAPagar), "b"]); }
  const altoTot = filas.length * 15 + 30 + (p.notas ? 40 : 0);
  if (y - altoTot < M.bottom + 10 * MM) { page = nueva(); y = cabeceraContinuacion(page, c); }
  y -= 6 * MM;
  const xT = A4.w - M.x - 72 * MM, anchoT = 72 * MM;
  const extra = filas.filter((f) => f[2] === "b").length * 5;
  if (tema.totales === "tinte") page.drawRectangle({ x: xT - 4 * MM, y: y - filas.length * 15 - extra - 8, width: anchoT + 4 * MM, height: filas.length * 15 + extra + 14, color: mezcla(c.acento, 0.07) });
  filas.forEach(([k, v, e], idx) => {
    const big = e === "b", ultima = idx === filas.length - 1;
    if (big) { y -= 5; if (!(tema.totales === "bloque" && ultima)) page.drawLine({ start: { x: xT, y: y + 2 }, end: { x: xT + anchoT - 3 * MM, y: y + 2 }, thickness: 0.6, color: tema.totales === "tinte" ? c.acento : LINEA }); }
    const destacada = tema.totales === "bloque" && ultima;
    if (destacada) page.drawRectangle({ x: xT - 4 * MM, y: y - 15, width: anchoT + 4 * MM, height: 20, color: c.acento });
    const colorValor = destacada ? BLANCO : big && ultima && tema.totales === "tinte" && k === "Total a pagar" ? c.acento : NEGRO;
    texto(page, c, k, xT, y - 9, { size: big ? 10.5 : CUERPO, font: big ? c.bold : c.reg, color: destacada ? BLANCO : big ? NEGRO : GRIS });
    texto(page, c, v, xT + anchoT - 3 * MM, y - 9, { size: big ? 10.5 : CUERPO, font: big ? c.bold : c.reg, align: "right", color: colorValor });
    y -= 15;
  });
  y -= 8 * MM;

  // Menciones legales obligatorias según el tipo de operación (RD 1619/2012 art. 6.1.m)
  const menciones: string[] = [];
  if (d.datos.lineas.some((l) => l.calificacion === "S2")) menciones.push("Operación con inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992 del IVA).");
  if (d.datos.lineas.some((l) => l.exenta)) menciones.push(`Operación exenta de IVA según la normativa aplicable (${[...new Set(d.datos.lineas.filter((l) => l.exenta).map((l) => l.exenta))].join(", ")}).`);
  if (p.notas) menciones.push(p.notas);
  if (p.mostrarIban && d.emisor.iban) menciones.push(`Forma de pago: transferencia a ${d.emisor.iban}`);
  for (const mtxt of menciones) for (const l of partir(c.reg, CUERPO, mtxt, anchoUtil)) {
    if (y < M.bottom + 8 * MM) { page = nueva(); y = cabeceraContinuacion(page, c); }
    texto(page, c, l, M.x, y, { color: GRIS }); y -= CUERPO + 3;
  }

  // ---------- Pie y numeración ----------
  paginas.forEach((pg, i) => {
    const yf = M.bottom - 6 * MM;
    pg.drawLine({ start: { x: M.x, y: yf + 10 }, end: { x: A4.w - M.x, y: yf + 10 }, thickness: 0.4, color: LINEA });
    if (p.pieLegal) texto(pg, c, partir(c.reg, 7, p.pieLegal, anchoUtil - 80)[0] ?? "", M.x, yf, { size: 7, color: GRIS });
    texto(pg, c, `Página ${i + 1} de ${paginas.length}`, A4.w - M.x, yf, { size: 7, color: GRIS, align: "right" });
  });
  return doc.save({ useObjectStreams: false });
}
