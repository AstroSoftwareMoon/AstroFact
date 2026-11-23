/**
 * Huella o «hash» de los registros de facturación y de evento.
 * Fuente: AEAT, "Detalle de las especificaciones técnicas para generación de la huella o hash
 * de los registros de facturación", v0.1.2 (27/08/2024) y art. 13 Orden HAC/1177/2024.
 *  - Algoritmo: SHA-256 (lista L12, valor "01").
 *  - Entrada: "campo1=valor1&campo2=valor2&..." en el orden indicado, valores sin espacios
 *    iniciales/finales, campos vacíos o ausentes como "campo=". Codificación UTF-8.
 *  - Salida: hexadecimal en mayúsculas, 64 caracteres.
 */
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";

export const TIPO_HUELLA_SHA256 = "01";

export interface HashInputAlta {
  IDEmisorFactura: string;
  NumSerieFactura: string;
  FechaExpedicionFactura: string;
  TipoFactura: string;
  CuotaTotal: string;
  ImporteTotal: string;
  /** Huella del registro anterior; "" o undefined si es el primer registro. */
  Huella?: string;
  FechaHoraHusoGenRegistro: string;
}
export interface HashInputAnulacion {
  IDEmisorFacturaAnulada: string;
  NumSerieFacturaAnulada: string;
  FechaExpedicionFacturaAnulada: string;
  Huella?: string;
  FechaHoraHusoGenRegistro: string;
}
export interface HashInputEvento {
  /** NIF del productor (SistemaInformatico/NIF) — excluyente con ID */
  NIF?: string;
  /** SistemaInformatico/IDOtro/ID — excluyente con NIF */
  ID?: string;
  IdSistemaInformatico: string;
  Version: string;
  NumeroInstalacion: string;
  /** ObligadoEmision/NIF */
  NIFObligado: string;
  TipoEvento: string;
  HuellaEvento?: string;
  FechaHoraHusoGenEvento: string;
}

const v = (x: string | undefined) => (x ?? "").trim();
const join = (pairs: [string, string | undefined][]) => pairs.map(([k, x]) => `${k}=${v(x)}`).join("&");

export function hashInputAlta(r: HashInputAlta): string {
  return join([
    ["IDEmisorFactura", r.IDEmisorFactura],
    ["NumSerieFactura", r.NumSerieFactura],
    ["FechaExpedicionFactura", r.FechaExpedicionFactura],
    ["TipoFactura", r.TipoFactura],
    ["CuotaTotal", r.CuotaTotal],
    ["ImporteTotal", r.ImporteTotal],
    ["Huella", r.Huella],
    ["FechaHoraHusoGenRegistro", r.FechaHoraHusoGenRegistro],
  ]);
}
export function hashInputAnulacion(r: HashInputAnulacion): string {
  return join([
    ["IDEmisorFacturaAnulada", r.IDEmisorFacturaAnulada],
    ["NumSerieFacturaAnulada", r.NumSerieFacturaAnulada],
    ["FechaExpedicionFacturaAnulada", r.FechaExpedicionFacturaAnulada],
    ["Huella", r.Huella],
    ["FechaHoraHusoGenRegistro", r.FechaHoraHusoGenRegistro],
  ]);
}
export function hashInputEvento(r: HashInputEvento): string {
  return join([
    ["NIF", r.NIF],
    ["ID", r.ID],
    ["IdSistemaInformatico", r.IdSistemaInformatico],
    ["Version", r.Version],
    ["NumeroInstalacion", r.NumeroInstalacion],
    ["NIF", r.NIFObligado],
    ["TipoEvento", r.TipoEvento],
    ["HuellaEvento", r.HuellaEvento],
    ["FechaHoraHusoGenEvento", r.FechaHoraHusoGenEvento],
  ]);
}

/** SHA-256 → hex mayúsculas (64 caracteres). */
export function calcularHuella(input: string): string {
  return bytesToHex(sha256(utf8ToBytes(input))).toUpperCase();
}

export const huellaAlta = (r: HashInputAlta) => calcularHuella(hashInputAlta(r));
export const huellaAnulacion = (r: HashInputAnulacion) => calcularHuella(hashInputAnulacion(r));
export const huellaEvento = (r: HashInputEvento) => calcularHuella(hashInputEvento(r));

export const isHuellaFormat = (h: string) => /^[0-9A-F]{64}$/.test(h);
