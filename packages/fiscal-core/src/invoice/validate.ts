/**
 * Validaciones de negocio previas a la emisión. Reproducen (en lo aplicable al emisor) las
 * reglas del documento oficial "Validaciones y errores VERI*FACTU" v1.2.2, apdo. 3.1.3, más
 * comprobaciones propias del RD 1619/2012. Cada incidencia indica la regla de origen.
 */
import { D, Dec, sum } from "../decimal";
import { compareCalendarDates } from "../dates";
import { LIMITES, RECARGO_POR_TIPO_IVA, TIPOS_IVA_ADMITIDOS, TIPOS_RECTIFICATIVA } from "../constants";
import { isValidNif, validateEuVat } from "../nif";
import { validarNumSerie } from "../numbering";
import { calcularTotales } from "./calc";
import type { FacturaBorrador } from "./types";

export interface Incidencia { nivel: "error" | "aviso"; codigo: string; mensaje: string; regla: string; }

const V = "Validaciones VERI*FACTU v1.2.2";

function tipoIvaPermitido(tipo: string, fechaOp: string): boolean {
  const t = D(tipo).toPlain();
  if (!(TIPOS_IVA_ADMITIDOS as readonly string[]).includes(t)) return false;
  if (t === "5") return compareCalendarDates(fechaOp, "2022-07-01") >= 0 && compareCalendarDates(fechaOp, "2024-09-30") <= 0;
  if (t === "2" || t === "7.5") return compareCalendarDates(fechaOp, "2024-10-01") >= 0 && compareCalendarDates(fechaOp, "2024-12-31") <= 0;
  return true;
}

export function validarFactura(f: FacturaBorrador, hoyIso = new Date().toISOString().slice(0, 10)): Incidencia[] {
  const out: Incidencia[] = [];
  const err = (codigo: string, mensaje: string, regla: string) => out.push({ nivel: "error", codigo, mensaje, regla });
  const aviso = (codigo: string, mensaje: string, regla: string) => out.push({ nivel: "aviso", codigo, mensaje, regla });
  const esRect = TIPOS_RECTIFICATIVA.includes(f.tipoFactura);
  const fechaOp = f.fechaOperacion ?? f.fechaExpedicion;

  // Emisor
  if (!isValidNif(f.emisor.nif)) err("EMISOR_NIF", "El NIF del emisor no es válido", "Orden EHA/451/2008");
  if (!f.emisor.nombre?.trim()) err("EMISOR_NOMBRE", "Falta el nombre o razón social del emisor", "art. 6.1.c RD 1619/2012");
  if (f.emisor.nombre && f.emisor.nombre.length > 120) err("EMISOR_NOMBRE_LARGO", "El nombre del emisor supera 120 caracteres", "XSD TextMax120Type");

  // Número y fechas
  const ns = validarNumSerie(f.numSerie);
  if (ns) err("NUMSERIE", ns, `${V} 3.1.3.1`);
  if (compareCalendarDates(f.fechaExpedicion, hoyIso) > 0) err("FECHA_FUTURA", "La fecha de expedición no puede ser posterior a hoy", `${V} 3.1.3.1`);
  if (compareCalendarDates(f.fechaExpedicion, LIMITES.fechaExpedicionMinima) < 0) err("FECHA_MINIMA", "La AEAT no admite fechas de expedición anteriores al 28/10/2024", `${V} 3.1.3.1`);
  const claves = new Set(f.lineas.map((l) => l.claveRegimen ?? "01"));
  const devengoDiferido = claves.has("14") || claves.has("15");
  if (f.fechaOperacion && compareCalendarDates(f.fechaOperacion, f.fechaExpedicion) > 0 && !devengoDiferido)
    err("FECHA_OPERACION", "La fecha de operación solo puede ser posterior a la de expedición con clave de régimen 14 o 15", `${V} 3.1.3.1/7`);

  if (!f.descripcionOperacion?.trim()) err("DESCRIPCION", "La descripción de la operación es obligatoria", "XSD DescripcionOperacion");
  if (f.descripcionOperacion && f.descripcionOperacion.length > 500) err("DESCRIPCION_LARGA", "La descripción supera 500 caracteres", "XSD TextMax500Type");
  if (!f.lineas.length) err("SIN_LINEAS", "La factura no tiene líneas", "art. 6.1.f RD 1619/2012");

  // Destinatarios (13)
  const dest = f.destinatarios ?? [];
  if (["F1", "F3", "R1", "R2", "R3", "R4"].includes(f.tipoFactura) && dest.length === 0)
    err("DESTINATARIO_OBLIGATORIO", `Las facturas ${f.tipoFactura} requieren al menos un destinatario`, `${V} 3.1.3.13`);
  if (["F2", "R5"].includes(f.tipoFactura) && dest.length > 0)
    err("DESTINATARIO_PROHIBIDO", "Las facturas simplificadas (F2/R5) no pueden llevar destinatarios en el registro", `${V} 3.1.3.13`);
  for (const d of dest) {
    if (d.nif && !isValidNif(d.nif)) err("DESTINATARIO_NIF", `NIF de destinatario no válido: ${d.nif}`, "Orden EHA/451/2008");
    if (!d.nif && !d.idOtro) err("DESTINATARIO_ID", `El destinatario "${d.nombre}" necesita NIF o identificación extranjera`, `${V} 3.1.3.13`);
    if (d.idOtro?.idType === "02" && !validateEuVat((d.idOtro.codigoPais ?? "") === "" ? d.idOtro.id : d.idOtro.id)) aviso("NIF_IVA", `Estructura de NIF-IVA dudosa: ${d.idOtro.id}`, `${V} nota (1)`);
    if (d.idOtro?.codigoPais === "ES" && !["03", "07"].includes(d.idOtro.idType)) err("IDOTRO_ES", "Con país ES solo se admite IDType 03 o 07", `${V} 3.1.3.13`);
    if (d.idOtro?.idType === "07" && d.idOtro.codigoPais !== "ES") err("NO_CENSADO", "IDType 07 (no censado) exige CodigoPais ES", `${V} 3.1.3.13`);
  }

  // Rectificativas (3, 4, 6)
  if (esRect && !f.rectificacion) err("RECT_TIPO", "Las rectificativas requieren tipo (sustitución o diferencias)", `${V} 3.1.3.3`);
  if (!esRect && f.rectificacion) err("RECT_NO_PERMITIDA", "Solo las facturas R1–R5 pueden ser rectificativas", `${V} 3.1.3.3`);
  if (f.rectificacion?.tipo === "S" && !f.rectificacion.importeRectificacion) err("RECT_IMPORTE", "Rectificativa por sustitución: falta ImporteRectificacion (base y cuota rectificadas)", `${V} 3.1.3.6`);
  if (f.rectificacion?.tipo === "I" && f.rectificacion.importeRectificacion) err("RECT_IMPORTE_I", "ImporteRectificacion solo se admite en rectificativas por sustitución", `${V} 3.1.3.6`);
  if (esRect && !f.rectificacion?.facturas.length) aviso("RECT_SIN_ORIGINAL", "Se recomienda identificar la(s) factura(s) rectificada(s)", "art. 15 RD 1619/2012");
  if (f.facturasSustituidas?.length && f.tipoFactura !== "F3") err("SUSTITUIDAS", "FacturasSustituidas solo se admite en F3", `${V} 3.1.3.5`);
  if (f.simplificadaArt7273 && !["F1", "F3", "R1", "R2", "R3", "R4"].includes(f.tipoFactura)) err("ART7273", "FacturaSimplificadaArt7273 no admitida para este tipo", `${V} 3.1.3.8`);
  if (f.sinIdentifDestinatarioArt61d && !["F2", "R5"].includes(f.tipoFactura)) err("ART61D", "FacturaSinIdentifDestinatarioArt61d solo con F2 o R5", `${V} 3.1.3.9`);

  // Líneas / desglose (15)
  for (const [i, l] of f.lineas.entries()) {
    const ref = `línea ${i + 1}`;
    const imp = l.impuesto ?? "01";
    const calif = l.exenta ? undefined : l.calificacion ?? "S1";
    try { D(l.cantidad); D(l.precioUnitario); } catch { err("LINEA_IMPORTE", `${ref}: cantidad o precio no numérico`, "—"); continue; }
    if (l.exenta && l.calificacion) err("EXENTA_Y_CALIF", `${ref}: exenta y calificación son excluyentes`, "XSD DetalleType");
    if (l.exenta && (l.tipo || l.recargo)) err("EXENTA_TIPO", `${ref}: una operación exenta no puede llevar tipo ni recargo`, `${V} 15.5`);
    if (imp === "01" && l.exenta && ["E7", "E8"].includes(l.exenta)) err("EXENTA_IGIC", `${ref}: E7/E8 solo para IGIC`, `${V} 15.5`);
    if ((l.claveRegimen ?? "01") === "01" && (l.exenta === "E2" || l.exenta === "E3")) err("EXENTA_CLAVE01", `${ref}: con clave 01 no se admiten E2 ni E3`, `${V} 15.5`);
    if ((l.claveRegimen ?? "01") === "02" && !l.exenta) err("EXPORTACION", `${ref}: con clave 02 (exportación) solo puede indicarse OperacionExenta`, `${V} 15.6.1`);
    if (calif === "S1") {
      if (l.tipo === undefined) err("TIPO_OBLIGATORIO", `${ref}: tipo impositivo obligatorio con S1`, `${V} 15.7`);
      else if (imp === "01" && !tipoIvaPermitido(l.tipo, fechaOp)) err("TIPO_IVA", `${ref}: tipo de IVA ${l.tipo}% no admitido para la fecha de operación`, `${V} 15.1`);
      if (imp === "01" && l.recargo !== undefined && l.tipo !== undefined) {
        const ok = (RECARGO_POR_TIPO_IVA[D(l.tipo).toPlain()] ?? []).includes(D(l.recargo).toPlain());
        if (!ok) err("RECARGO", `${ref}: recargo ${l.recargo}% no corresponde al tipo ${l.tipo}%`, `${V} 15.3`);
      }
      if ((l.claveRegimen ?? "01") === "11" && imp === "01" && D(l.tipo ?? "0").toPlain() !== "21") err("ARRENDAMIENTO", `${ref}: clave 11 solo admite tipo 21%`, `${V} 15.6.8`);
    }
    if (calif === "S2" && !["F1", "F3", "R1", "R2", "R3", "R4"].includes(f.tipoFactura)) err("S2_TIPO", `${ref}: inversión del sujeto pasivo (S2) no admitida en ${f.tipoFactura}`, `${V} 15.4`);
    if ((calif === "N1" || calif === "N2") && imp === "01" && (l.tipo || l.recargo)) err("NO_SUJETA_TIPO", `${ref}: operación no sujeta sin tipo ni recargo`, `${V} 15.4`);
    if ((l.claveRegimen ?? "01") === "08" && calif !== "N2") err("CLAVE08", `${ref}: clave 08 requiere calificación N2`, `${V} 15.6.6`);
    if ((l.claveRegimen ?? "01") === "07" && (calif === "S2" || calif === "N1" || calif === "N2")) err("CAJA", `${ref}: criterio de caja (07) no admite S2, N1 ni N2`, `${V} 15.6.5`);
    if ((l.claveRegimen ?? "01") === "10" && (calif !== "N1" || f.tipoFactura !== "F1")) err("CLAVE10", `${ref}: clave 10 exige N1 y factura F1`, `${V} 15.6.7`);
    if (l.descuentoPct && (D(l.descuentoPct).cmp(0) < 0 || D(l.descuentoPct).cmp(100) > 0)) err("DESCUENTO", `${ref}: descuento fuera de 0–100%`, "—");
  }
  if (f.lineas.length) {
    const t = calcularTotales(f);
    if (t.desglose.length > 12) err("DESGLOSE_MAX", "El registro admite como máximo 12 líneas de desglose (combinaciones de impuesto/régimen/tipo)", "XSD DesgloseType maxOccurs=12");
    if (f.tipoFactura === "F2") {
      const tot = sum(t.desglose.map((g) => g.base.add(g.cuota)));
      if (!f.sinIdentifDestinatarioArt61d && tot.cmp(D(LIMITES.maxSimplificadaEuros).add(LIMITES.toleranciaEuros)) > 0)
        err("F2_LIMITE", "Una factura simplificada no puede superar 3.000 € (IVA incluido)", `${V} 15.8`);
      else if (tot.cmp(400) > 0)
        aviso("F2_400", "Las simplificadas por encima de 400 € solo se permiten en los supuestos del art. 4.1 RD 1619/2012", "art. 4 RD 1619/2012");
    }
    if (!esRect || f.rectificacion?.tipo === "S") {
      for (const g of t.desglose) if (g.cuota.sign() !== 0 && g.base.sign() !== 0 && g.cuota.sign() !== g.base.sign())
        err("SIGNO", "Base y cuota deben tener el mismo signo", `${V} 15.7`);
    }
    if (f.retencionPct && (D(f.retencionPct).cmp(0) < 0 || D(f.retencionPct).cmp(100) >= 0)) err("RETENCION", "Retención fuera de rango", "—");
    if (t.importeTotal.abs().cmp(D("999999999999.99")) > 0) err("IMPORTE_RANGO", "Importe total fuera de rango", "XSD ImporteSgn12.2Type");
  }
  return out;
}

export const tieneErrores = (xs: Incidencia[]) => xs.some((x) => x.nivel === "error");
export { Dec };
