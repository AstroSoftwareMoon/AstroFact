/**
 * Copias de seguridad «.astro»: la base de datos completa, cifrada con AES-256-GCM (PBKDF2-SHA-256)
 * con una contraseña propia de la copia.
 *
 * Formato: "AFCOPIA1" (8 bytes) + longitud (u32 LE) + manifiesto JSON en claro (solo formato, versión y
 * fecha: nada de datos fiscales) + contenedor cifrado (secure.ts) con la base de datos SQLite.
 * Dentro de la parte cifrada se verifica la huella SHA-256 de la base de datos.
 *
 * Restaurar es un evento del sistema (TipoEvento 07, «Restauración de copia de seguridad, cuando ésta se
 * gestione desde el propio sistema informático de facturación», EventosSIF.xsd). Para no romper la
 * trazabilidad, NO se permite restaurar una copia que haría desaparecer registros de facturación ya
 * generados ni una que diverja de la cadena actual (decisión documentada en TODO-normativa #17).
 */
import { sha256 } from "@noble/hashes/sha2";
import { bytesToHex } from "@noble/hashes/utils";
import { desempaquetarCifrado, empaquetarCifrado } from "./secure";
import type { AstroFactStore } from "./store";

const MAGIC = new TextEncoder().encode("AFCOPIA1");
export interface ManifiestoCopia { formato: 1; app: "AstroFact"; version: string; creada: string; }
export interface ContenidoCopia { manifiesto: ManifiestoCopia; db: Uint8Array; }

export const esCopiaAstro = (b: Uint8Array) => b.length > 12 && MAGIC.every((x, i) => b[i] === x);

export async function crearCopia(db: Uint8Array, password: string, version: string, creada = new Date()): Promise<Uint8Array> {
  if (password.length < 8) throw new Error("La contraseña de la copia debe tener al menos 8 caracteres");
  const manifiesto: ManifiestoCopia = { formato: 1, app: "AstroFact", version, creada: creada.toISOString() };
  const m = new TextEncoder().encode(JSON.stringify(manifiesto));
  const huella = new TextEncoder().encode(bytesToHex(sha256(db)));          // 64 bytes
  const interior = new Uint8Array(64 + db.length); interior.set(huella); interior.set(db, 64);
  const cif = await empaquetarCifrado(interior, password);
  const out = new Uint8Array(8 + 4 + m.length + cif.length);
  out.set(MAGIC); new DataView(out.buffer).setUint32(8, m.length, true); out.set(m, 12); out.set(cif, 12 + m.length);
  return out;
}

export async function leerCopia(b: Uint8Array, password: string): Promise<ContenidoCopia> {
  if (!esCopiaAstro(b)) throw new Error("No es una copia de seguridad de AstroFact (.astro)");
  const n = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(8, true);
  if (n > 4096 || 12 + n > b.length) throw new Error("Copia dañada");
  const manifiesto = JSON.parse(new TextDecoder().decode(b.subarray(12, 12 + n))) as ManifiestoCopia;
  if (manifiesto.formato !== 1) throw new Error(`Formato de copia no soportado (${manifiesto.formato})`);
  const interior = await desempaquetarCifrado(b.subarray(12 + n), password);
  const huella = new TextDecoder().decode(interior.subarray(0, 64)), db = interior.slice(64);
  if (bytesToHex(sha256(db)) !== huella) throw new Error("La copia está dañada (la huella no coincide)");
  if (new TextDecoder().decode(db.subarray(0, 15)) !== "SQLite format 3") throw new Error("La copia no contiene una base de datos válida");
  return { manifiesto, db };
}

export type VeredictoRestauracion =
  | { permitida: true; caso: "vacio" | "igual" | "recupera"; registrosCopia: number; registrosActuales: number; resumen: string }
  | { permitida: false; caso: "anterior" | "divergente" | "otro_negocio" | "copia_corrupta" | "sin_datos"; registrosCopia: number; registrosActuales: number; resumen: string };

/** Decide si restaurar `copia` sobre `actual` respeta la trazabilidad de los registros de facturación. */
export async function evaluarRestauracion(actual: AstroFactStore | undefined, copia: AstroFactStore): Promise<VeredictoRestauracion> {
  const oc = copia.obligado();
  if (!oc) return { permitida: false, caso: "sin_datos", registrosCopia: 0, registrosActuales: 0, resumen: "La copia no contiene ningún negocio." };
  const hc = copia.registros(oc.id).map((r) => r.huella);
  const integ = await copia.verificarIntegridad(oc.id);
  if (!integ.facturacion.ok) return { permitida: false, caso: "copia_corrupta", registrosCopia: hc.length, registrosActuales: 0, resumen: "La cadena de registros de la copia no es íntegra: no se puede restaurar." };
  const oa = actual?.obligado();
  const ha = oa ? actual!.registros(oa.id).map((r) => r.huella) : [];
  const base = { registrosCopia: hc.length, registrosActuales: ha.length };
  if (!oa || ha.length === 0) return { permitida: true, caso: "vacio", ...base, resumen: `Se restaurarán ${hc.length} registros de facturación de ${oc.nombre}.` };
  if (oa.nif !== oc.nif) return { permitida: false, caso: "otro_negocio", ...base, resumen: `La copia es de otro negocio (${oc.nif}) y aquí ya hay registros de ${oa.nif}.` };
  const comun = Math.min(ha.length, hc.length);
  for (let i = 0; i < comun; i++) if (ha[i] !== hc[i]) return { permitida: false, caso: "divergente", ...base, resumen: `La cadena de la copia diverge de la actual en el registro ${i + 1}: restaurarla rompería la trazabilidad.` };
  if (hc.length < ha.length) return { permitida: false, caso: "anterior", ...base, resumen: `La copia es anterior: se perderían ${ha.length - hc.length} registros de facturación ya generados. La normativa exige conservarlos.` };
  return hc.length === ha.length
    ? { permitida: true, caso: "igual", ...base, resumen: "La copia contiene los mismos registros de facturación que los datos actuales." }
    : { permitida: true, caso: "recupera", ...base, resumen: `La copia contiene ${hc.length - ha.length} registros más que los datos actuales.` };
}

/** Anota la restauración como evento (tipo 07) en la base de datos restaurada. */
export async function registrarRestauracion(restaurada: AstroFactStore, m: ManifiestoCopia) {
  const o = restaurada.obligado(); if (!o) return;
  await restaurada.registrarEvento(o.id, "07", undefined, `Copia del ${m.creada.slice(0, 19).replace("T", " ")} UTC (v${m.version})`.slice(0, 100));
}
