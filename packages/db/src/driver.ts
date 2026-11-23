/** Interfaz mínima de acceso SQLite, común a node:sqlite (tests/servidor), sql.js (app/PWA) y otros. */
export type SqlValue = string | number | null | Uint8Array;
export interface RunResult { changes: number; lastInsertRowid: number; }
export interface SqlDriver {
  exec(sql: string): void;
  run(sql: string, params?: SqlValue[]): RunResult;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T[];
  get<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): T | undefined;
}

/** Transacción síncrona (BEGIN IMMEDIATE): o se aplica todo o nada. */
export function tx<T>(db: SqlDriver, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try { const r = fn(); db.exec("COMMIT"); return r; }
  catch (e) { try { db.exec("ROLLBACK"); } catch { /* ya revertida */ } throw e; }
}

/** Mutex asíncrono: serializa operaciones que mezclan pasos async (firma) con escritura. */
export class Mutex {
  private tail: Promise<void> = Promise.resolve();
  run<T>(fn: () => Promise<T>): Promise<T> {
    const p = this.tail.then(fn, fn);
    this.tail = p.then(() => undefined, () => undefined);
    return p;
  }
}
