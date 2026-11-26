/**
 * Réplica de solo lectura para los clientes: copia de la base de datos SIN usuarios, sesiones,
 * secretos ni certificados. El cliente la abre con sql.js y usa el mismo AstroFactStore para leer.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function generarReplica(dbPath: string): Uint8Array {
  const dir = mkdtempSync(join(tmpdir(), "af-replica-"));
  const f = join(dir, "replica.db");
  try {
    const src = new DatabaseSync(dbPath);
    src.exec(`VACUUM INTO '${f.replace(/'/g, "''")}'`);
    src.close();
    const d = new DatabaseSync(f);
    d.exec(`DROP TABLE IF EXISTS sesion; DROP TABLE IF EXISTS usuario; DROP TABLE IF EXISTS secreto;
      UPDATE certificado SET p12_cifrado = x'', kdf_json = '{}';
      DELETE FROM meta WHERE clave LIKE 'vf_flujo:%';
      UPDATE envio_aeat SET peticion_xml = NULL, respuesta_xml = NULL;
      UPDATE adjunto SET datos = x''; -- los adjuntos se descargan bajo demanda (adjuntoDatos)
      VACUUM;`);
    d.close();
    return new Uint8Array(readFileSync(f));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
