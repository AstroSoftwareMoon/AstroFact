/** ZIP mínimo: escritura sin compresión y lectura (store y deflate, vía DecompressionStream). */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(b: Uint8Array) { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = new TextEncoder();

export function crearZip(ficheros: { nombre: string; contenido: string | Uint8Array }[], fecha = new Date()): Uint8Array {
  const partes: Uint8Array[] = [], central: Uint8Array[] = []; let off = 0;
  const dt = ((fecha.getHours() << 11) | (fecha.getMinutes() << 5) | (fecha.getSeconds() >> 1)) & 0xffff;
  const dd = (((fecha.getFullYear() - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()) & 0xffff;
  for (const f of ficheros) {
    const name = enc.encode(f.nombre), data = typeof f.contenido === "string" ? enc.encode(f.contenido) : f.contenido, crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(10, dt, true); h.setUint16(12, dd, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true);
    partes.push(new Uint8Array(h.buffer), name, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(12, dt, true); c.setUint16(14, dd, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(new Uint8Array(c.buffer), name);
    off += 30 + name.length + data.length;
  }
  const cSize = central.reduce((a, b) => a + b.length, 0);
  const e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, ficheros.length, true); e.setUint16(10, ficheros.length, true); e.setUint32(12, cSize, true); e.setUint32(16, off, true);
  const all = [...partes, ...central, new Uint8Array(e.buffer)];
  const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; for (const a of all) { out.set(a, p); p += a.length; }
  return out;
}

async function inflar(datos: Uint8Array): Promise<Uint8Array> {
  const ds = new DecompressionStream("deflate-raw");
  const s = new Blob([datos as BlobPart]).stream().pipeThrough(ds);
  return new Uint8Array(await new Response(s).arrayBuffer());
}
/** Lee las entradas de un ZIP (directorio central). Límite de 50 MB descomprimidos por fichero. */
export async function leerZip(b: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65_557); i--) if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("No es un archivo ZIP/XLSX válido");
  const n = v.getUint16(eocd + 10, true); let p = v.getUint32(eocd + 16, true);
  const out = new Map<string, Uint8Array>(); const dec = new TextDecoder();
  for (let i = 0; i < n; i++) {
    if (v.getUint32(p, true) !== 0x02014b50) throw new Error("ZIP dañado");
    const metodo = v.getUint16(p + 10, true), comp = v.getUint32(p + 20, true), tam = v.getUint32(p + 24, true);
    const ln = v.getUint16(p + 28, true), le = v.getUint16(p + 30, true), lc = v.getUint16(p + 32, true), off = v.getUint32(p + 42, true);
    const nombre = dec.decode(b.subarray(p + 46, p + 46 + ln));
    const inicio = off + 30 + v.getUint16(off + 26, true) + v.getUint16(off + 28, true);
    if (tam > 50 * 1024 * 1024) throw new Error(`Fichero demasiado grande dentro del ZIP: ${nombre}`);
    const datos = b.subarray(inicio, inicio + comp);
    if (metodo === 0) out.set(nombre, datos); else if (metodo === 8) out.set(nombre, await inflar(datos)); else throw new Error(`Compresión no soportada (${metodo})`);
    p += 46 + ln + le + lc;
  }
  return out;
}
