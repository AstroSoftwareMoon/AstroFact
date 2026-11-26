import type { FacturaBorrador } from "@astrofact/fiscal-core";
/** Estructuras mínimas (compatibles con Factura y Gasto de @astrofact/db) para no depender de la capa de datos. */
export interface DesgloseInf { impuesto: string; calificacion?: string; exenta?: string; tipo?: string; recargo?: string; base: string; cuota: string; cuotaRecargo: string; }
export interface FacturaInf {
  id: number; numSerie: string; fechaExpedicion: string; fechaOperacion?: string; tipoFactura: string; anulada: boolean; terceroId?: number;
  datos: Pick<FacturaBorrador, "destinatarios" | "retencionPct" | "descripcionOperacion" | "lineas" | "rectificacion" | "emisor">;
  totales: { baseTotal: string; cuotaTotal: string; importeTotal: string; retencion: string; totalAPagar: string; desglose: DesgloseInf[]; lineas?: { base: string }[] };
  estadoCobro?: string;
}
export interface GastoInf {
  id: number; proveedorNombre: string; proveedorNif?: string; fecha: string; numero?: string; concepto: string; categoria: string;
  desglose: { base: string; tipo: string; cuota: string; recargo: string; cuotaRecargo: string }[];
  baseTotal: string; cuotaTotal: string; retencion: string; total: string; pctDeducible: string; inversionSujetoPasivo: boolean; estadoPago?: string;
}
/** Hoja de cálculo genérica: la primera fila son las cabeceras. Números como number (euros con 2 decimales). */
export interface Hoja { nombre: string; columnas: string[]; filas: (string | number | null)[][]; anchos?: number[]; }
export const enPeriodo = (iso: string, desde: string, hasta: string) => iso >= desde && iso <= hasta;
export const trimestreRango = (anio: number, t: 1 | 2 | 3 | 4) => ({ desde: `${anio}-${String((t - 1) * 3 + 1).padStart(2, "0")}-01`, hasta: `${anio}-${String(t * 3).padStart(2, "0")}-${["31", "30", "30", "31"][t - 1]}` });
