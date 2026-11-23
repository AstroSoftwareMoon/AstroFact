/**
 * Persistencia local de la base de datos (bytes de SQLite, opcionalmente cifrados).
 * Web/PWA y Tauri: IndexedDB del propio WebView (en Tauri vive en el directorio de datos de la app).
 * Nunca sale del dispositivo. Cero telemetría.
 */
const DB_NAME = "astrofact", STORE = "kv", KEY = "db";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function op<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(STORE, mode); const rq = fn(t.objectStore(STORE)); rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error); });
}
export const cargarBytes = () => op<Uint8Array | undefined>("readonly", (s) => s.get(KEY));
export const guardarBytes = (b: Uint8Array) => op("readwrite", (s) => s.put(b, KEY));
export const borrarTodo = () => op("readwrite", (s) => s.delete(KEY));
export const pref = {
  get: (k: string) => { try { return localStorage.getItem(`af:${k}`); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(`af:${k}`, v); } catch { /* modo privado */ } },
};

/** Descarga un fichero generado (exportaciones, XML). */
export function descargar(nombre: string, contenido: string | Uint8Array, tipo = "application/xml") {
  const blob = new Blob([contenido as BlobPart], { type: tipo });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
