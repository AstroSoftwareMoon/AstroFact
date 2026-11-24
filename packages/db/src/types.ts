import type { FacturaBorrador, Territorio, TipoEvento, Totales } from "@astrofact/fiscal-core";

export interface Direccion { linea1?: string; cp?: string; municipio?: string; provincia?: string; pais?: string; }
export type Modo = "verifactu" | "no_verifactu";
export type Entorno = "pruebas" | "produccion";

export interface Obligado {
  id: number; nif: string; nombre: string; direccion?: Direccion; email?: string; telefono?: string; iban?: string;
  territorio: Territorio; modo: Modo; entorno: Entorno; pieLegal?: string; creadoEn: string;
}
export interface Serie {
  id: number; obligadoId: number; codigo: string; plantilla: string; clase: "ordinaria" | "rectificativa" | "simplificada";
  reinicioAnual: boolean; ultimoNumero: number; ultimaFecha?: string; anio?: number; activa: boolean;
}
export interface Tercero {
  id: number; obligadoId: number; tipo: "cliente" | "proveedor" | "ambos"; nombre: string; nif?: string;
  idOtro?: { codigoPais?: string; idType: "02" | "03" | "04" | "05" | "06" | "07"; id: string };
  direccion?: Direccion; email?: string; telefono?: string; formaPago?: string; recargoEquivalencia: boolean;
  retencionPct?: string; notas?: string; anonimizadoEn?: string; creadoEn: string; actualizadoEn: string;
}
export interface Producto {
  id: number; obligadoId: number; codigo?: string; nombre: string; descripcion?: string; precio: string; unidad?: string;
  impuesto: "01" | "02" | "03" | "05"; tipo?: string; calificacion?: "S1" | "S2" | "N1" | "N2"; exenta?: string;
  sujetaRetencion: boolean; activo: boolean; creadoEn: string;
}
/** Totales serializables (importes como cadenas con 2 decimales). */
export interface TotalesJson {
  baseTotal: string; cuotaTotal: string; importeTotal: string; retencion: string; baseRetencion: string; totalAPagar: string;
  desglose: { impuesto: string; claveRegimen?: string; calificacion?: string; exenta?: string; tipo?: string; recargo?: string; base: string; cuota: string; cuotaRecargo: string }[];
  lineas: { base: string; cuota: string; cuotaRecargo: string }[];
}
export interface Factura {
  id: number; obligadoId: number; serieId: number; numero: number; numSerie: string; fechaExpedicion: string; fechaOperacion?: string;
  tipoFactura: string; tipoRectificativa?: string; terceroId?: number; datos: FacturaBorrador; totales: TotalesJson;
  qrUrl: string; dePruebas: boolean; estadoCobro: "pendiente" | "cobrada" | "parcial" | "impagada"; vencimiento?: string;
  anulada: boolean; rectificadaPor?: number; emitidaEn: string;
}
export interface RegistroRow {
  id: number; obligadoId: number; facturaId?: number; tipo: "alta" | "anulacion"; numSerie: string; fechaExpedicion: string;
  fechaHoraGen: string; huella: string; huellaAnterior?: string; xml: string; firmado: boolean; exportadoEn?: string;
}
export interface EventoRow { id: number; obligadoId: number; tipo: TipoEvento; fechaHoraGen: string; huella: string; xml: string; firmado: boolean; }
export interface Alarma { id: number; obligadoId?: number; tipo: string; mensaje: string; detalle?: unknown; creadaEn: string; resueltaEn?: string; }
export interface CertificadoInfo { id: number; titular?: string; nif?: string; validoDesde?: string; validoHasta?: string; dePruebas: boolean; }

export function totalesAJson(t: Totales): TotalesJson {
  const f = (d: { toFixed(n: number): string }) => d.toFixed(2);
  return {
    baseTotal: f(t.baseTotal), cuotaTotal: f(t.cuotaTotal), importeTotal: f(t.importeTotal), retencion: f(t.retencion),
    baseRetencion: f(t.baseRetencion), totalAPagar: f(t.totalAPagar),
    desglose: t.desglose.map((g) => ({ impuesto: g.impuesto, claveRegimen: g.claveRegimen, calificacion: g.calificacion, exenta: g.exenta,
      tipo: g.tipo?.toPlain(), recargo: g.recargo?.toPlain(), base: f(g.base), cuota: f(g.cuota), cuotaRecargo: f(g.cuotaRecargo) })),
    lineas: t.lineas.map((l) => ({ base: f(l.base), cuota: f(l.cuota), cuotaRecargo: f(l.cuotaRecargo) })),
  };
}

/** Plantilla de factura guardada (el logo va en base64 dentro de la propia base de datos). */
export interface PlantillaGuardada {
  estilo: "moderna" | "clasica" | "minimal"; colorAcento: string; logoB64?: string; logoTipo?: "png" | "jpg";
  pieLegal?: string; notas?: string; mostrarIban: boolean;
}
export const PLANTILLA_GUARDADA_DEFECTO: PlantillaGuardada = { estilo: "moderna", colorAcento: "#6C63FF", mostrarIban: true };
