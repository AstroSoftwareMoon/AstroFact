/** Driver para node:sqlite (Node ≥ 22.13). Usado en tests y en el servidor autohospedado. */
import { DatabaseSync } from "node:sqlite";
import type { SqlDriver, SqlValue } from "../driver";

export function nodeSqlite(path = ":memory:"): SqlDriver & { close(): void } {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA foreign_keys = ON");
  const norm = (r: any) => (r === undefined ? undefined : { ...r });
  return {
    exec: (sql) => db.exec(sql),
    run: (sql, params: SqlValue[] = []) => { const r = db.prepare(sql).run(...(params as any[])); return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) }; },
    all: (sql, params: SqlValue[] = []) => db.prepare(sql).all(...(params as any[])).map(norm) as any,
    get: (sql, params: SqlValue[] = []) => norm(db.prepare(sql).get(...(params as any[]))) as any,
    close: () => db.close(),
  };
}
