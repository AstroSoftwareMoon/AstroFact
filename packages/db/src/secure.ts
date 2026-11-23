/**
 * Cifrado de secretos y de la base de datos con WebCrypto (disponible en navegador, Tauri y Node).
 * KDF: PBKDF2-SHA-256 (600.000 iteraciones, recomendación OWASP 2023) → AES-256-GCM.
 * Nota: el servidor (fase 5) usará argon2id para contraseñas de usuario.
 */
export interface Kdf { alg: "PBKDF2-SHA256"; iter: number; salt: string; iv: string; }
const ITER = 600_000;
const b64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const enc = new TextEncoder();

async function clave(password: string, salt: Uint8Array, iter: number) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: salt as BufferSource, iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function cifrar(datos: Uint8Array, password: string, iter = ITER): Promise<{ datos: Uint8Array; kdf: Kdf }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const k = await clave(password, salt, iter);
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, k, datos as BufferSource));
  return { datos: out, kdf: { alg: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv) } };
}

export async function descifrar(datos: Uint8Array, password: string, kdf: Kdf): Promise<Uint8Array> {
  const k = await clave(password, unb64(kdf.salt), kdf.iter);
  try { return new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(kdf.iv) as BufferSource }, k, datos as BufferSource)); }
  catch { throw new Error("Contraseña incorrecta o datos dañados"); }
}

/** Contenedor de base de datos cifrada: "ASTRODB1" + longitud JSON (4 bytes) + JSON kdf + datos. */
const MAGIC = enc.encode("ASTRODB1");
export async function empaquetarCifrado(bytes: Uint8Array, password: string): Promise<Uint8Array> {
  const { datos, kdf } = await cifrar(bytes, password);
  const j = enc.encode(JSON.stringify(kdf));
  const out = new Uint8Array(MAGIC.length + 4 + j.length + datos.length);
  out.set(MAGIC); new DataView(out.buffer).setUint32(MAGIC.length, j.length); out.set(j, MAGIC.length + 4); out.set(datos, MAGIC.length + 4 + j.length);
  return out;
}
export const estaCifrado = (b: Uint8Array) => b.length > 12 && MAGIC.every((x, i) => b[i] === x);
export async function desempaquetarCifrado(b: Uint8Array, password: string): Promise<Uint8Array> {
  if (!estaCifrado(b)) throw new Error("No es una base de datos cifrada de AstroFact");
  const len = new DataView(b.buffer, b.byteOffset).getUint32(MAGIC.length);
  const kdf = JSON.parse(new TextDecoder().decode(b.subarray(MAGIC.length + 4, MAGIC.length + 4 + len))) as Kdf;
  return descifrar(b.subarray(MAGIC.length + 4 + len), password, kdf);
}
export const kdfToJson = (k: Kdf) => JSON.stringify(k);
export const kdfFromJson = (s: string) => JSON.parse(s) as Kdf;

/**
 * Cifrador con clave derivada en caché: deriva una vez (PBKDF2) y cifra cada guardado con un IV nuevo.
 * Produce el mismo contenedor "ASTRODB1" que empaquetarCifrado.
 */
export async function crearCifrador(password: string, kdfBase?: Pick<Kdf, "salt" | "iter">) {
  const salt = kdfBase ? unb64(kdfBase.salt) : crypto.getRandomValues(new Uint8Array(16));
  const iter = kdfBase?.iter ?? ITER;
  const k = await clave(password, salt, iter);
  return {
    async empaquetar(bytes: Uint8Array): Promise<Uint8Array> {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const datos = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, k, bytes as BufferSource));
      const jj = enc.encode(JSON.stringify({ alg: "PBKDF2-SHA256", iter, salt: b64(salt), iv: b64(iv) } satisfies Kdf));
      const out = new Uint8Array(MAGIC.length + 4 + jj.length + datos.length);
      out.set(MAGIC); new DataView(out.buffer).setUint32(MAGIC.length, jj.length); out.set(jj, MAGIC.length + 4); out.set(datos, MAGIC.length + 4 + jj.length);
      return out;
    },
  };
}
/** Lee los parámetros KDF de un contenedor cifrado (sin descifrar). */
export function kdfDeContenedor(b: Uint8Array): Kdf {
  const len = new DataView(b.buffer, b.byteOffset).getUint32(MAGIC.length);
  return JSON.parse(new TextDecoder().decode(b.subarray(MAGIC.length + 4, MAGIC.length + 4 + len))) as Kdf;
}
