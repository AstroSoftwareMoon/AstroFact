/**
 * Driver sql.js (SQLite compilado a WebAssembly) para la app (Tauri) y la PWA.
 * La base de datos vive en memoria y se persiste como bytes (opcionalmente cifrados)
 * mediante la función `persistir` que aporta la plataforma (IndexedDB, fichero…).
 */
import type { Database, SqlJsStatic } from "sql.js";
import type { SqlDriver, SqlValue } from "../driver";

export interface SqlJsDriver extends SqlDriver { exportar(): Uint8Array; db: Database; }

export function sqljsDriver(SQL: SqlJsStatic, bytes?: Uint8Array | null): SqlJsDriver {
  const db = bytes ? new SQL.Database(bytes) : new SQL.Database();
  db.exec("PRAGMA foreign_keys = ON");
  const rows = <T>(sql: string, params: SqlValue[] = []): T[] => {
    const st = db.prepare(sql);
    try { st.bind(params as any); const out: T[] = []; while (st.step()) out.push(st.getAsObject() as T); return out; }
    finally { st.free(); }
  };
  return {
    db,
    exec: (sql) => { db.exec(sql); },
    run: (sql, params = []) => {
      db.run(sql, params as any);
      const id = db.exec("SELECT last_insert_rowid() AS id")[0]?.values[0]?.[0];
      return { changes: db.getRowsModified(), lastInsertRowid: Number(id ?? 0) };
    },
    all: rows,
    get: (sql, params = []) => rows<any>(sql, params)[0],
    exportar: () => db.export(),
  };
}
