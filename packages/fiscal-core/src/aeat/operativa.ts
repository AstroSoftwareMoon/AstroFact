/**
 * Operativa de alta y anulación ante la AEAT (solo VERI*FACTU), según los cuadros oficiales
 * «A) Cuadro Operativa Alta» y «B) Cuadro Operativa Anulación» de DsRegistroVeriFactu.xlsx v1.0.
 * Devuelve los valores de Subsanacion / RechazoPrevio / SinRegistroPrevio a informar.
 */
export type SituacionAlta =
  | "nuevo"                       // ALTA inicial
  | "rechazado"                   // ALTA POR RECHAZO: el alta inicial fue rechazada (no existe en la AEAT)
  | "aceptado"                    // ALTA DE SUBSANACIÓN: existe en la AEAT y se corrigen datos
  | "subsanacion_rechazada"       // ALTA POR RECHAZO DE SUBSANACIÓN: existe en la AEAT, su subsanación fue rechazada
  | "no_remitido";                // ALTA DE SUBSANACIÓN SIN REGISTRO PREVIO (p. ej. venía de No VERI*FACTU)

export interface MarcasAlta { Subsanacion?: "S" | "N"; RechazoPrevio?: "N" | "S" | "X"; }

export function marcasAlta(s: SituacionAlta): MarcasAlta {
  switch (s) {
    case "nuevo": return {};
    case "rechazado": return { Subsanacion: "S", RechazoPrevio: "X" };
    case "aceptado": return { Subsanacion: "S" };
    case "subsanacion_rechazada": return { Subsanacion: "S", RechazoPrevio: "S" };
    case "no_remitido": return { Subsanacion: "S", RechazoPrevio: "X" };
  }
}

export type SituacionAnulacion =
  | "normal"                      // ANULACIÓN: el registro existe en la AEAT
  | "rechazada"                   // ANULACIÓN POR RECHAZO: existe en la AEAT y la anulación previa fue rechazada
  | "sin_registro_previo"         // ANULACIÓN SIN REGISTRO PREVIO: no existe en la AEAT
  | "sin_registro_previo_rechazada";

export interface MarcasAnulacion { SinRegistroPrevio?: "S" | "N"; RechazoPrevio?: "S" | "N"; }
export function marcasAnulacion(s: SituacionAnulacion): MarcasAnulacion {
  switch (s) {
    case "normal": return {};
    case "rechazada": return { RechazoPrevio: "S" };
    case "sin_registro_previo": return { SinRegistroPrevio: "S" };
    case "sin_registro_previo_rechazada": return { SinRegistroPrevio: "S", RechazoPrevio: "S" };
  }
}

/** Situación en la AEAT de una factura (clave: NIF + NumSerie + Fecha), tal como la ve el simulador o el SIF. */
export type EstadoClaveAeat = "no_existe" | "alta" | "anulada";

/**
 * Resultado esperado según el cuadro oficial (OK / ERROR) para una operación y la situación en la AEAT.
 * Lo usa el simulador; las notas (1)–(10) corresponden a la leyenda del cuadro.
 */
export function resultadoCuadro(op: { tipo: "alta"; Subsanacion?: string; RechazoPrevio?: string } | { tipo: "anulacion"; SinRegistroPrevio?: string; RechazoPrevio?: string }, est: EstadoClaveAeat): { ok: boolean; nota: number; codigo?: number } {
  if (op.tipo === "alta") {
    const sub = op.Subsanacion === "S", rp = op.RechazoPrevio ?? "N";
    if (!sub && rp === "S") return { ok: false, nota: 0, codigo: 1100 }; // combinación no admitida (L17)
    if (!sub) return est === "no_existe" ? { ok: true, nota: 1 } : { ok: false, nota: 2, codigo: 3000 };
    if (rp === "X") return est === "no_existe" ? { ok: true, nota: 1 } : { ok: false, nota: 2, codigo: 3000 };
    // Subsanación con registro previo (N o S)
    if (est === "no_existe") return { ok: false, nota: 3, codigo: 3002 };
    return { ok: true, nota: est === "alta" ? 4 : 5 };
  }
  const srp = op.SinRegistroPrevio === "S";
  if (srp) return est === "no_existe" ? { ok: true, nota: 9 } : { ok: false, nota: 10, codigo: 3000 };
  if (est === "no_existe") return { ok: false, nota: 6, codigo: 3002 };
  return { ok: true, nota: est === "alta" ? 7 : 8 };
}
