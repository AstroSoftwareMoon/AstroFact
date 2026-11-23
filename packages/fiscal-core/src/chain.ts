/**
 * Verificación de integridad y trazabilidad de la cadena de registros
 * (arts. 6.b, 6.e, 6.f, 7.h, 7.i y 7.j Orden HAC/1177/2024). Las anomalías se
 * clasifican con los códigos oficiales de la lista L1E (TipoAnomalia).
 */
import { LIMITES, type TipoAnomalia } from "./constants";
import { parseIsoWithOffset } from "./dates";
import { cabezaDe, recalcularHuella } from "./records/build";
import type { RegistroFacturacion } from "./records/types";

export interface Anomalia { indice: number; tipo: TipoAnomalia; mensaje: string; }
export interface ResultadoCadena { ok: boolean; registrosComprobados: number; anomalias: Anomalia[]; }
export interface OpcionesVerificacion {
  ahora?: Date;
  /** Verificador de firma opcional (No VERI*FACTU). Devuelve true si la firma es válida. */
  verificarFirma?: (indice: number) => boolean | Promise<boolean>;
  /** Comprobación parcial: [desde, hasta] (índices incluidos). */
  desde?: number;
  hasta?: number;
  /** true si el primer registro del tramo NO es el primero del sistema (verificación parcial). */
  tramoIntermedio?: boolean;
}

const encOf = (r: RegistroFacturacion) => r.registro.Encadenamiento;

/** Comprueba una cadena ordenada por fecha de generación. */
export async function verificarCadena(regs: RegistroFacturacion[], opts: OpcionesVerificacion = {}): Promise<ResultadoCadena> {
  const ahora = opts.ahora ?? new Date();
  const desde = Math.max(0, opts.desde ?? 0);
  const hasta = Math.min(regs.length - 1, opts.hasta ?? regs.length - 1);
  const anomalias: Anomalia[] = [];
  const add = (indice: number, tipo: TipoAnomalia, mensaje: string) => anomalias.push({ indice, tipo, mensaje });

  for (let i = desde; i <= hasta; i++) {
    const r = regs[i]!;
    // 01 — integridad de la huella
    const h = recalcularHuella(r);
    if (h !== r.registro.Huella) add(i, "01", `La huella almacenada no coincide con la recalculada (${r.registro.Huella.slice(0, 12)}… ≠ ${h.slice(0, 12)}…)`);
    // 02 — firma
    if (opts.verificarFirma && !(await opts.verificarFirma(i))) add(i, "02", "La firma electrónica del registro no es válida");

    const enc = encOf(r);
    const esPrimeroGlobal = i === 0 && !opts.tramoIntermedio;
    if ("PrimerRegistro" in enc) {
      if (!esPrimeroGlobal) add(i, "06", "Registro marcado como primero de la cadena, pero existen registros anteriores");
    } else {
      if (esPrimeroGlobal) add(i, "04", "Registro no primero pero el registro anterior no existe en el sistema");
      else if (i > 0) {
        const prev = cabezaDe(regs[i - 1]!);
        const ref = enc.RegistroAnterior;
        if (ref.IDEmisorFactura !== prev.IDEmisorFactura || ref.NumSerieFactura !== prev.NumSerieFactura || ref.FechaExpedicionFactura !== prev.FechaExpedicionFactura)
          add(i, "04", `El registro anterior referenciado (${ref.NumSerieFactura}) no es el inmediatamente anterior (${prev.NumSerieFactura})`);
        if (ref.Huella !== prev.Huella.slice(0, 64)) add(i, "08", "El campo 'huella del registro anterior' no coincide con la huella del registro anterior");
      }
    }
    // Fechas
    const t = parseIsoWithOffset(r.registro.FechaHoraHusoGenRegistro).getTime();
    if (i > 0) {
      const tp = parseIsoWithOffset(regs[i - 1]!.registro.FechaHoraHusoGenRegistro).getTime();
      if (t < tp) add(i, "11", "Fecha-hora de generación anterior a la del registro anterior");
    }
    if (t > ahora.getTime() + LIMITES.margenRelojSeg * 1000) add(i, "13", "Fecha-hora de generación posterior a la fecha-hora actual del sistema");
  }
  return { ok: anomalias.length === 0, registrosComprobados: hasta - desde + 1, anomalias };
}

export interface SaltoCadena {
  desde: number;
  hacia: number;
  huellaCorrecta: boolean;
  ordenTemporalCorrecto: boolean;
}

/** Navegación adelante/atrás con indicación de corrección del salto (art. 7.h). */
export function saltar(regs: RegistroFacturacion[], indice: number, dir: "anterior" | "posterior", ahora = new Date()): SaltoCadena | null {
  const j = dir === "anterior" ? indice - 1 : indice + 1;
  if (j < 0 || j >= regs.length) return null;
  const [a, b] = dir === "anterior" ? [j, indice] : [indice, j];
  const prev = regs[a]!, next = regs[b]!;
  const enc = encOf(next);
  const huellaCorrecta = "RegistroAnterior" in enc && enc.RegistroAnterior.Huella === prev.registro.Huella && recalcularHuella(prev) === prev.registro.Huella && recalcularHuella(next) === next.registro.Huella;
  const ta = parseIsoWithOffset(prev.registro.FechaHoraHusoGenRegistro).getTime();
  const tb = parseIsoWithOffset(next.registro.FechaHoraHusoGenRegistro).getTime();
  const lim = ahora.getTime() + LIMITES.margenRelojSeg * 1000;
  return { desde: indice, hacia: j, huellaCorrecta, ordenTemporalCorrecto: ta <= tb && tb <= lim };
}

/**
 * Comprobaciones previas a generar un nuevo registro (art. 7.i):
 *  1.º el último registro está correctamente encadenado;
 *  2.º su fecha-hora no supera en más de 1 minuto la fecha-hora actual.
 */
export function comprobarAntesDeGenerar(ultimo: RegistroFacturacion | null, penultimo: RegistroFacturacion | null, ahora: Date): { ok: boolean; motivo?: string } {
  if (!ultimo) return { ok: true };
  if (recalcularHuella(ultimo) !== ultimo.registro.Huella) return { ok: false, motivo: "La huella del último registro no es correcta" };
  const enc = encOf(ultimo);
  if (penultimo) {
    if (!("RegistroAnterior" in enc) || enc.RegistroAnterior.Huella !== penultimo.registro.Huella) return { ok: false, motivo: "El último registro no está correctamente encadenado" };
  } else if (!("PrimerRegistro" in enc)) return { ok: false, motivo: "El último registro referencia un anterior inexistente" };
  const t = parseIsoWithOffset(ultimo.registro.FechaHoraHusoGenRegistro).getTime();
  if (t > ahora.getTime() + LIMITES.margenRelojSeg * 1000) return { ok: false, motivo: "La fecha-hora del último registro supera en más de un minuto la actual: revise el reloj del sistema" };
  return { ok: true };
}
