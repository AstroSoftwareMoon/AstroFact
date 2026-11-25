/**
 * Motor de remisión VERI*FACTU (art. 16 Orden HAC/1177/2024; Descripción del servicio web v1.0.3).
 *  - Cola persistente: los registros quedan «pendiente» al generarse y se envían en orden de la cadena.
 *  - Control de flujo: espera de TiempoEsperaEnvio (inicial 60 s) o 1000 registros, lo que ocurra antes.
 *  - Errores de transporte / SOAP Fault de servidor: los registros vuelven a la cola con backoff exponencial.
 *  - SOAP Fault de cliente (esquema) o rechazo: el registro queda «rechazado» con el código oficial y
 *    requiere subsanación (AstroFactStore.subsanar) o rectificativa.
 *  - Duplicado (3000) de un registro que la AEAT ya tiene como correcto: se trata como aceptado
 *    (p. ej. se perdió la respuesta de un envío anterior).
 * El transporte (HTTPS con certificado de cliente) es inyectable: Node (servidor), Rust (Tauri) o simulador.
 */
import {
  backoffMs, ENDPOINTS, esperaRestante, estadoFlujoInicial, LIMITES, parsearRespuesta, puedeEnviar, sobreSoap, textoErrorAeat, trasEnvio,
  type EstadoFlujo, type LineaRespuesta,
} from "@astrofact/fiscal-core";
import type { AstroFactStore } from "./store";
import type { EstadoAeat } from "./types";

export interface CredencialTls { p12: Uint8Array; password: string; }
export interface Transporte { enviar(url: string, soap: string, cred: CredencialTls): Promise<{ status: number; body: string }>; }

export type ResultadoTick =
  | { accion: "nada"; motivo: "modo" | "sin_pendientes" }
  | { accion: "esperar"; ms: number; motivo: "flujo" | "reintento" }
  | { accion: "bloqueado"; motivo: "sin_certificado" | "configuracion"; mensaje?: string }
  | { accion: "enviado"; envioId: number; estado: string; aceptados: number; conErrores: number; rechazados: number; tiempoEspera: number }
  | { accion: "error"; envioId: number; mensaje: string; reintentoEnMs?: number };

interface EstadoMotor extends EstadoFlujo { intentosFallidos: number; proximoIntento: number | null; }

export interface OpcionesMotor { ahora?: () => number; url?: (entorno: "pruebas" | "produccion") => string; }

const clave = (l: { NumSerieFactura: string; FechaExpedicionFactura: string; tipo: string }) => `${l.tipo}|${l.NumSerieFactura}|${l.FechaExpedicionFactura}`;

export class MotorVerifactu {
  private ahora: () => number;
  private url: (e: "pruebas" | "produccion") => string;
  private enCurso = new Set<number>();
  constructor(private store: AstroFactStore, private transporte: Transporte, o: OpcionesMotor = {}) {
    this.ahora = o.ahora ?? (() => Date.now());
    this.url = o.url ?? ((e) => ENDPOINTS[e].verifactu);
  }

  estado(obligadoId: number): EstadoMotor {
    const m = this.store.meta(`vf_flujo:${obligadoId}`);
    return m ? JSON.parse(m) : { ...estadoFlujoInicial(), intentosFallidos: 0, proximoIntento: null };
  }
  private guardar(obligadoId: number, e: EstadoMotor) { this.store.setMeta(`vf_flujo:${obligadoId}`, JSON.stringify(e)); }

  /** Intenta un envío si toca. Llamar periódicamente (p. ej. cada 5 s) y tras emitir. */
  async tick(obligadoId: number): Promise<ResultadoTick> {
    if (this.enCurso.has(obligadoId)) return { accion: "esperar", ms: 1000, motivo: "flujo" };
    this.enCurso.add(obligadoId);
    try { return await this.tickInterno(obligadoId); } finally { this.enCurso.delete(obligadoId); }
  }

  private async tickInterno(obligadoId: number): Promise<ResultadoTick> {
    const o = this.store.obligado(obligadoId);
    if (!o || o.modo !== "verifactu") return { accion: "nada", motivo: "modo" };
    const n = this.store.contarPendientes(obligadoId);
    if (!n) return { accion: "nada", motivo: "sin_pendientes" };
    const est = this.estado(obligadoId);
    const ahora = this.ahora();
    if (est.proximoIntento && ahora < est.proximoIntento) return { accion: "esperar", ms: est.proximoIntento - ahora, motivo: "reintento" };
    if (!puedeEnviar(est, n, ahora)) return { accion: "esperar", ms: esperaRestante(est, n, ahora), motivo: "flujo" };
    const cred = this.store.credencialTransporte(obligadoId);
    if (!cred) return { accion: "bloqueado", motivo: "sin_certificado" };

    let url: string;
    try { url = this.url(o.entorno); } catch (e) { return { accion: "bloqueado", motivo: "configuracion", mensaje: (e as Error).message }; }
    const lote = this.store.pendientesEnvio(obligadoId, LIMITES.registrosPorEnvio);
    const soap = sobreSoap({ ObligadoEmision: { NombreRazon: o.nombre, NIF: o.nif } }, lote.map((l) => l.registro));
    const envioId = this.store.iniciarEnvio(obligadoId, lote.map((l) => l.id), soap);

    const fallo = (mensaje: string, respuesta?: string): ResultadoTick => {
      const intentos = est.intentosFallidos + 1;
      const espera = backoffMs(intentos);
      this.store.finalizarEnvio(envioId, { estado: "error_transporte", error: mensaje, respuesta, devolverAPendiente: true });
      this.guardar(obligadoId, { ...est, intentosFallidos: intentos, proximoIntento: ahora + espera });
      if (intentos >= 3) this.store.abrirAlarma(obligadoId, "aeat", `No se pueden enviar los registros a la AEAT (${mensaje}). Se reintentará automáticamente.`);
      return { accion: "error", envioId, mensaje, reintentoEnMs: espera };
    };

    let resp: { status: number; body: string };
    try { resp = await this.transporte.enviar(url, soap, cred); }
    catch (e) { return fallo(`Error de conexión: ${(e as Error).message}`); }
    if (resp.status >= 500 && !/Fault/.test(resp.body)) return fallo(`HTTP ${resp.status}`, resp.body);

    let r;
    try { r = parsearRespuesta(resp.body); } catch (e) { return fallo(`Respuesta no válida: ${(e as Error).message}`, resp.body); }

    if (r.tipo === "fault") {
      const cod = Number(/Codigo\[(\d+)\]/.exec(r.faultstring)?.[1] ?? NaN);
      const deServidor = /server/i.test(r.faultcode) && !Number.isFinite(cod);
      if (deServidor) return fallo(`SOAP Fault: ${r.faultstring}`, resp.body);
      // Rechazo completo por estructura/cabecera: no se reintenta sin intervención
      this.store.finalizarEnvio(envioId, { estado: "fault", error: r.faultstring, respuesta: resp.body,
        lineas: lote.map((l) => ({ registroId: l.id, estado: "rechazado" as EstadoAeat, codigo: Number.isFinite(cod) ? cod : undefined, descripcion: r.faultstring.slice(0, 500) })) });
      this.guardar(obligadoId, { ...trasEnvio(est, ahora), intentosFallidos: 0, proximoIntento: null });
      this.store.abrirAlarma(obligadoId, "aeat", `La AEAT rechazó el envío completo: ${r.faultstring}`);
      return { accion: "error", envioId, mensaje: r.faultstring };
    }

    // Correspondencia respuesta ↔ registros (por tipo de operación + número + fecha, en orden)
    const porClave = new Map<string, LineaRespuesta[]>();
    for (const l of r.lineas) { const k = clave({ ...l, tipo: l.TipoOperacion === "Anulacion" ? "anulacion" : "alta" }); (porClave.get(k) ?? porClave.set(k, []).get(k)!).push(l); }
    let aceptados = 0, conErrores = 0, rechazados = 0;
    const lineas = lote.map((x) => {
      const reg = x.registro;
      const id = reg.tipo === "alta" ? reg.registro.IDFactura : { NumSerieFactura: reg.registro.IDFactura.NumSerieFacturaAnulada, FechaExpedicionFactura: reg.registro.IDFactura.FechaExpedicionFacturaAnulada };
      const l = porClave.get(clave({ ...id, tipo: reg.tipo }))?.shift();
      let estado: EstadoAeat; let codigo = l?.CodigoErrorRegistro; let descripcion = l?.DescripcionErrorRegistro;
      if (!l) { estado = "rechazado"; descripcion = "La respuesta de la AEAT no incluye este registro"; }
      else if (l.EstadoRegistro === "Correcto") estado = "aceptado";
      else if (l.EstadoRegistro === "AceptadoConErrores") estado = "aceptado_con_errores";
      else if (codigo === 3000 && l.RegistroDuplicado && /Correct/i.test(l.RegistroDuplicado.EstadoRegistroDuplicado)) { estado = "aceptado"; descripcion = "Ya registrado en la AEAT (respuesta anterior perdida)"; }
      else estado = "rechazado";
      if (codigo && !descripcion) descripcion = textoErrorAeat(codigo);
      if (estado === "aceptado") aceptados++; else if (estado === "aceptado_con_errores") conErrores++; else rechazados++;
      return { registroId: x.id, estado, codigo, descripcion };
    });
    this.store.finalizarEnvio(envioId, { estado: r.EstadoEnvio, csv: r.CSV, tiempoEspera: r.TiempoEsperaEnvio, respuesta: resp.body, lineas });
    this.guardar(obligadoId, { ...trasEnvio(est, ahora, r.TiempoEsperaEnvio), intentosFallidos: 0, proximoIntento: null });
    this.store.revisarAlarmasAeat(obligadoId, true);
    if (rechazados) this.store.abrirAlarma(obligadoId, "aeat_rechazo", `${rechazados} registro(s) rechazados por la AEAT: revisa «Envíos AEAT» y subsánalos`);
    return { accion: "enviado", envioId, estado: r.EstadoEnvio, aceptados, conErrores, rechazados, tiempoEspera: r.TiempoEsperaEnvio };
  }
}
