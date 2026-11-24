import type { FacturaBorrador } from "@astrofact/fiscal-core";

export type Estilo = "moderna" | "clasica" | "minimal";
export interface Plantilla {
  estilo: Estilo;
  /** Color de acento en hexadecimal (#RRGGBB). */
  colorAcento: string;
  logo?: { bytes: Uint8Array; tipo: "png" | "jpg" };
  /** Texto del pie (registro mercantil, condiciones…). */
  pieLegal?: string;
  /** Notas que se imprimen tras los totales (forma de pago, agradecimiento…). */
  notas?: string;
  mostrarIban?: boolean;
}
export const PLANTILLA_DEFECTO: Plantilla = { estilo: "moderna", colorAcento: "#6C63FF", mostrarIban: true };

/** Estructura mínima de totales (coincide con TotalesJson de @astrofact/db). */
export interface TotalesPdf {
  baseTotal: string; cuotaTotal: string; importeTotal: string; retencion: string; totalAPagar: string;
  desglose: { impuesto: string; calificacion?: string; exenta?: string; tipo?: string; recargo?: string; base: string; cuota: string; cuotaRecargo: string }[];
  lineas: { base: string }[];
}
export interface DatosPdf {
  numSerie: string;
  fechaExpedicion: string; // YYYY-MM-DD
  fechaOperacion?: string;
  vencimiento?: string;
  tipoFactura: string;
  datos: FacturaBorrador;
  totales: TotalesPdf;
  qrUrl: string;
  dePruebas: boolean;
  anulada: boolean;
  emisor: { nombre: string; nif: string; direccion?: { linea1?: string; cp?: string; municipio?: string; provincia?: string; pais?: string }; email?: string; telefono?: string; iban?: string };
  modo: "verifactu" | "no_verifactu";
}
