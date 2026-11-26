import type { FacturaBorrador } from "@astrofact/fiscal-core";

export type Estilo = "moderna" | "clasica" | "minimal" | "elegante" | "creativa" | "corporativa" | "nordica" | "tecnica";
/** Estilos disponibles con su nombre y una descripción breve (para la interfaz). */
export const ESTILOS: { id: Estilo; nombre: string; descripcion: string; color: string }[] = [
  { id: "moderna", nombre: "Moderna", descripcion: "Cabecera de tabla en color y totales tintados", color: "#6C63FF" },
  { id: "clasica", nombre: "Clásica", descripcion: "Sobria, con bordes finos", color: "#0B7285" },
  { id: "minimal", nombre: "Minimal", descripcion: "Solo tipografía y aire", color: "#111827" },
  { id: "elegante", nombre: "Elegante", descripcion: "Tipografía con serifa y dobles filetes", color: "#8B5E34" },
  { id: "creativa", nombre: "Creativa", descripcion: "Banda lateral, filas alternas y total destacado", color: "#E8590C" },
  { id: "corporativa", nombre: "Corporativa", descripcion: "Cabecera oscura y bloque de total", color: "#1D4ED8" },
  { id: "nordica", nombre: "Nórdica", descripcion: "Tonos suaves y filas alternas", color: "#2F9E44" },
  { id: "tecnica", nombre: "Técnica", descripcion: "Monoespaciada, estilo ticket", color: "#374151" },
];
/** Rasgos visuales de cada estilo. Ninguno toca el bloque del QR, que siempre va primero y sobre blanco. */
export interface Tema {
  fuente: "sans" | "serif" | "mono";
  separador: "acento" | "fino" | "doble" | "nada";
  cliente: "tinte" | "borde" | "nada" | "barra";
  cabTabla: "relleno" | "oscuro" | "linea" | "lineaNegra" | "doble";
  totales: "tinte" | "simple" | "bloque";
  banda: boolean; zebra: boolean; tituloAcento: boolean;
}
export const TEMAS: Record<Estilo, Tema> = {
  moderna: { fuente: "sans", separador: "acento", cliente: "tinte", cabTabla: "relleno", totales: "tinte", banda: false, zebra: false, tituloAcento: true },
  clasica: { fuente: "sans", separador: "fino", cliente: "borde", cabTabla: "lineaNegra", totales: "simple", banda: false, zebra: false, tituloAcento: false },
  minimal: { fuente: "sans", separador: "fino", cliente: "nada", cabTabla: "linea", totales: "simple", banda: false, zebra: false, tituloAcento: false },
  elegante: { fuente: "serif", separador: "doble", cliente: "borde", cabTabla: "doble", totales: "simple", banda: false, zebra: false, tituloAcento: true },
  creativa: { fuente: "sans", separador: "nada", cliente: "barra", cabTabla: "relleno", totales: "bloque", banda: true, zebra: true, tituloAcento: true },
  corporativa: { fuente: "sans", separador: "acento", cliente: "barra", cabTabla: "oscuro", totales: "bloque", banda: false, zebra: false, tituloAcento: true },
  nordica: { fuente: "sans", separador: "fino", cliente: "tinte", cabTabla: "linea", totales: "tinte", banda: false, zebra: true, tituloAcento: true },
  tecnica: { fuente: "mono", separador: "doble", cliente: "borde", cabTabla: "doble", totales: "simple", banda: false, zebra: false, tituloAcento: false },
};
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
  /** «sin_registros»: factura sin sistema de registros (sin QR tributario). */
  modo: "verifactu" | "no_verifactu" | "sin_registros";
}
