/**
 * Control de flujo de la remisión VERI*FACTU (art. 16.2 Orden HAC/1177/2024; Descripción
 * del servicio web v1.0.3, 6.4.4.1): esperar «t» segundos desde el envío anterior (inicialmente 60,
 * actualizado por cada respuesta en TiempoEsperaEnvio) o hasta acumular el máximo de registros
 * por envío (1000), lo que ocurra primero. Lógica pura y determinista: el reloj se inyecta.
 */
import { LIMITES } from "../constants";

export interface EstadoFlujo { ultimoEnvio: number | null; tiempoEsperaSeg: number; }
export const estadoFlujoInicial = (): EstadoFlujo => ({ ultimoEnvio: null, tiempoEsperaSeg: LIMITES.tiempoEsperaInicialSeg });

export function puedeEnviar(e: EstadoFlujo, pendientes: number, ahora: number): boolean {
  if (pendientes <= 0) return false;
  if (e.ultimoEnvio === null) return true;
  if (pendientes >= LIMITES.registrosPorEnvio) return true;
  return ahora - e.ultimoEnvio >= e.tiempoEsperaSeg * 1000;
}

/** Milisegundos hasta poder enviar (0 si ya se puede; Infinity si no hay pendientes). */
export function esperaRestante(e: EstadoFlujo, pendientes: number, ahora: number): number {
  if (pendientes <= 0) return Infinity;
  if (puedeEnviar(e, pendientes, ahora)) return 0;
  return e.ultimoEnvio! + e.tiempoEsperaSeg * 1000 - ahora;
}

export const tamanoLote = (pendientes: number) => Math.min(pendientes, LIMITES.registrosPorEnvio);

export function trasEnvio(e: EstadoFlujo, ahora: number, tiempoEsperaRespuesta?: number): EstadoFlujo {
  return { ultimoEnvio: ahora, tiempoEsperaSeg: tiempoEsperaRespuesta && tiempoEsperaRespuesta > 0 ? tiempoEsperaRespuesta : e.tiempoEsperaSeg };
}

/**
 * Reintentos ante errores de transporte (timeouts, 5xx): backoff exponencial con tope,
 * siempre respetando además el tiempo de espera del control de flujo.
 * TODO(normativa): la AEAT no fija una política de reintentos; valores propios configurables.
 */
export function backoffMs(intento: number, baseMs = 30_000, maxMs = 30 * 60_000): number {
  return Math.min(maxMs, baseMs * 2 ** Math.max(0, intento - 1));
}

/**
 * Códigos de error que admiten subsanación con un nuevo registro (Subsanacion=S / RechazoPrevio)
 * frente a los que requieren corregir datos. La clasificación fina depende de la tabla oficial de
 * errores ("Validaciones y errores", apdo. 5) y se hará en apps/server — TODO(fase 5).
 */
export function requiereIntervencionUsuario(estado: "Incorrecto" | "AceptadoConErrores" | "Correcto"): boolean {
  return estado !== "Correcto";
}
