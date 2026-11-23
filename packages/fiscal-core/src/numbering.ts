/**
 * Numeración de facturas por series: correlativa, sin saltos ni duplicados (art. 6.1.a
 * RD 1619/2012) y con fechas coherentes. La exclusión mutua real (concurrencia) la
 * garantiza la capa de datos con una transacción; este módulo aporta la lógica pura.
 */
import { compareCalendarDates } from "./dates";

export interface Serie {
  codigo: string;           // p. ej. "A", "R" (rectificativas), "S" (simplificadas)
  /** Plantilla: {serie}, {año}, {num}, {num:N} (relleno a N dígitos). */
  plantilla: string;
  /** Reinicio anual de la numeración. */
  reinicioAnual: boolean;
}
export interface EstadoSerie { ultimoNumero: number; ultimaFecha?: string; anio?: number; }

/** Caracteres prohibidos en NumSerieFactura (Validaciones AEAT 3.1.3.1). */
const PROHIBIDOS = /["'<>=]/;

export function validarNumSerie(s: string): string | null {
  if (s.length < 1 || s.length > 60) return "NumSerieFactura debe tener entre 1 y 60 caracteres";
  for (const ch of s) { const c = ch.charCodeAt(0); if (c < 32 || c > 126) return "NumSerieFactura solo admite caracteres ASCII imprimibles (32–126)"; }
  if (PROHIBIDOS.test(s)) return "NumSerieFactura no puede contener \" ' < > =";
  if (s !== s.trim()) return "NumSerieFactura no debe empezar ni terminar con espacios";
  return null;
}

export function formatearNumero(serie: Serie, numero: number, fechaIso: string): string {
  const anio = fechaIso.slice(0, 4);
  const out = serie.plantilla
    .replace(/\{serie\}/g, serie.codigo)
    .replace(/\{a[ñn]o\}/g, anio)
    .replace(/\{num(?::(\d+))?\}/g, (_m, w) => (w ? String(numero).padStart(Number(w), "0") : String(numero)));
  const err = validarNumSerie(out);
  if (err) throw new Error(err);
  return out;
}

/**
 * Calcula el siguiente número y valida la coherencia de fecha.
 * Lanza error si la fecha es anterior a la última factura de la serie.
 */
export function siguienteNumero(serie: Serie, estado: EstadoSerie, fechaIso: string): { numero: number; numSerie: string; estado: EstadoSerie } {
  if (estado.ultimaFecha && compareCalendarDates(fechaIso, estado.ultimaFecha) < 0)
    throw new Error(`La fecha ${fechaIso} es anterior a la de la última factura de la serie ${serie.codigo} (${estado.ultimaFecha}). Use otra serie o la fecha correcta.`);
  const anio = Number(fechaIso.slice(0, 4));
  const reinicia = serie.reinicioAnual && estado.anio !== undefined && anio !== estado.anio;
  const numero = reinicia ? 1 : estado.ultimoNumero + 1;
  return { numero, numSerie: formatearNumero(serie, numero, fechaIso), estado: { ultimoNumero: numero, ultimaFecha: fechaIso, anio } };
}

export interface ProblemaNumeracion { tipo: "salto" | "duplicado" | "fecha-incoherente"; detalle: string; }

/** Auditoría de una serie: detecta saltos, duplicados y fechas no monótonas. */
export function auditarSerie(facturas: { numero: number; fecha: string; anio?: number }[]): ProblemaNumeracion[] {
  const out: ProblemaNumeracion[] = [];
  const porAnio = new Map<number | undefined, typeof facturas>();
  for (const f of facturas) { const k = f.anio; (porAnio.get(k) ?? porAnio.set(k, []).get(k)!).push(f); }
  for (const [anio, lista] of porAnio) {
    const sorted = [...lista].sort((a, b) => a.numero - b.numero);
    for (let i = 0; i < sorted.length; i++) {
      const f = sorted[i]!;
      if (i === 0 && f.numero !== 1) out.push({ tipo: "salto", detalle: `${anio ?? ""} la numeración empieza en ${f.numero}` });
      if (i > 0) {
        const p = sorted[i - 1]!;
        if (f.numero === p.numero) out.push({ tipo: "duplicado", detalle: `número ${f.numero} repetido` });
        else if (f.numero !== p.numero + 1) out.push({ tipo: "salto", detalle: `faltan números entre ${p.numero} y ${f.numero}` });
        if (compareCalendarDates(f.fecha, p.fecha) < 0) out.push({ tipo: "fecha-incoherente", detalle: `la factura ${f.numero} (${f.fecha}) tiene fecha anterior a la ${p.numero} (${p.fecha})` });
      }
    }
  }
  return out;
}
