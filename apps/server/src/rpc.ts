/**
 * Llamadas remotas a AstroFactStore con lista blanca de métodos y rol mínimo por método.
 * Los Uint8Array viajan como {"$b64": "..."}.
 */
import type { AstroFactStore } from "@astrofact/db";
import type { Rol } from "./usuarios";

export const METODOS: Readonly<Record<string, Rol>> = Object.freeze({
  // lectura: consultas que no están en la réplica o necesitan el estado vivo
  envioDetalle: "lectura", adjuntoDatos: "lectura", exportarDatosTercero: "contable",
  // contable: operación diaria
  guardarTercero: "contable", guardarProducto: "contable", archivarProducto: "contable",
  emitir: "contable", anular: "contable", subsanar: "contable", marcarCobro: "contable",
  verificarIntegridad: "contable", exportarRegistros: "contable", exportarEventos: "contable",
  // gestión comercial (fase 6)
  guardarGasto: "contable", eliminarGasto: "contable", marcarGastoPagado: "contable", anadirAdjunto: "contable", eliminarAdjunto: "contable",
  guardarDocumento: "contable", cambiarEstadoDocumento: "contable", convertirEnAlbaran: "contable", facturarDocumentos: "contable",
  guardarRecurrencia: "contable", procesarRecurrentes: "contable", registrarCobro: "contable", eliminarCobro: "contable",
  registrarRecordatorio: "contable", importarMovimientos: "contable", conciliar: "contable",
  // propietario: configuración, datos fiscales del negocio y certificado
  crearObligado: "propietario", actualizarObligado: "propietario", crearSerie: "propietario", anonimizarTercero: "propietario",
  guardarPlantilla: "propietario", guardarCertificado: "propietario", generarCertificadoPruebas: "propietario",
  desbloquearCertificado: "propietario", activarVerifactu: "propietario", activarRegistros: "propietario",
});
/** Rol requerido, solo para métodos propios de la lista blanca (nada de la cadena de prototipos). */
export const rolDe = (m: string): Rol | undefined => (Object.hasOwn(METODOS, m) ? METODOS[m] : undefined);

export const revivir = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(revivir);
  if (v && typeof v === "object") {
    if ("$b64" in (v as object) && Object.keys(v as object).length === 1) return new Uint8Array(Buffer.from((v as { $b64: string }).$b64, "base64"));
    return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, revivir(x)]));
  }
  return v;
};
export const serializar = (v: unknown): unknown => {
  if (v instanceof Uint8Array) return { $b64: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(serializar);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, serializar(x)]));
  return v;
};

export async function ejecutar(store: AstroFactStore, metodo: string, args: unknown[]): Promise<unknown> {
  const fn = (store as unknown as Record<string, (...a: unknown[]) => unknown>)[metodo];
  if (!rolDe(metodo) || typeof fn !== "function") throw new Error(`Método no permitido: ${metodo}`);
  return fn.apply(store, revivir(args) as unknown[]);
}
