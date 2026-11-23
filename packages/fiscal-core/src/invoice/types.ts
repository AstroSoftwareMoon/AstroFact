import type { Calificacion, ClaveRegimen, IdType, Impuesto, OperacionExenta, TipoFactura, TipoRectificativa } from "../constants";
import type { IDFactura } from "../records/types";

/** Parte (emisor/destinatario). Para extranjeros sin NIF español se usa idOtro. */
export interface Parte {
  nombre: string;
  nif?: string;
  idOtro?: { codigoPais?: string; idType: IdType; id: string };
  direccion?: { linea1?: string; cp?: string; municipio?: string; provincia?: string; pais?: string };
}

export interface LineaFactura {
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  /** Porcentaje de descuento (0–100). */
  descuentoPct?: string;
  impuesto?: Impuesto;          // defecto "01" IVA
  claveRegimen?: ClaveRegimen;  // defecto "01"
  calificacion?: Calificacion;  // defecto "S1" (excluyente con exenta)
  exenta?: OperacionExenta;
  /** Tipo impositivo en % (p. ej. "21"). Obligatorio con S1. */
  tipo?: string;
  /** Tipo de recargo de equivalencia en % (p. ej. "5.2"). */
  recargo?: string;
  /** Si la línea está sujeta a retención IRPF (por defecto true si hay retencionPct). */
  sujetaRetencion?: boolean;
}

export type MetodoRedondeo = "por-tipo" | "por-linea";

export interface Rectificacion {
  tipo: TipoRectificativa;
  /** Facturas rectificadas (identificador AEAT). */
  facturas: IDFactura[];
  /** Solo por sustitución (S): importes de la(s) factura(s) original(es). */
  importeRectificacion?: { baseRectificada: string; cuotaRectificada: string; cuotaRecargoRectificado?: string };
  motivo?: string;
}

export interface FacturaBorrador {
  tipoFactura: TipoFactura;
  /** NumSerieFactura completo (serie + número), asignado por numbering.ts */
  numSerie: string;
  /** YYYY-MM-DD */
  fechaExpedicion: string;
  /** YYYY-MM-DD, solo si distinta de la de expedición */
  fechaOperacion?: string;
  emisor: Parte & { nif: string };
  destinatarios?: Parte[];
  descripcionOperacion: string;
  lineas: LineaFactura[];
  /** Retención IRPF en % (no forma parte de ImporteTotal: FAQ AEAT). */
  retencionPct?: string;
  rectificacion?: Rectificacion;
  /** F3: facturas simplificadas sustituidas */
  facturasSustituidas?: IDFactura[];
  simplificadaArt7273?: boolean;
  sinIdentifDestinatarioArt61d?: boolean;
  redondeo?: MetodoRedondeo;
  refExterna?: string;
}
