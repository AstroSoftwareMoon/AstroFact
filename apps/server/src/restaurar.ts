/**
 * Restauración de una copia «.astro» en el servidor (con el servidor DETENIDO):
 *   ASTROFACT_COPIA_PASSWORD=... node index.js restaurar copia.astro
 * Aplica las mismas reglas que la app: no se restaura una copia que haga perder registros de facturación
 * o diverja de la cadena actual. La base de datos anterior se conserva como astrofact.db.previa-<fecha>.
 */
import { copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { AstroFactStore, evaluarRestauracion, leerCopia, registrarRestauracion } from "@astrofact/db";
import { nodeSqlite } from "@astrofact/db/node";

export async function restaurar(fichero: string, dataDir: string, password: string | undefined) {
  if (!password) throw new Error("Indica la contraseña de la copia en ASTROFACT_COPIA_PASSWORD");
  const { manifiesto, db } = await leerCopia(new Uint8Array(readFileSync(fichero)), password);
  const destino = join(dataDir, "astrofact.db");
  const tmp = join(dataDir, `restaurando-${Date.now()}.db`);
  writeFileSync(tmp, db);
  const copia = new AstroFactStore(nodeSqlite(tmp));
  const actual = existsSync(destino) ? new AstroFactStore(nodeSqlite(destino)) : undefined;
  const v = await evaluarRestauracion(actual, copia);
  console.log(v.resumen);
  if (!v.permitida) throw new Error("Restauración denegada para preservar la trazabilidad de los registros de facturación");
  if (existsSync(destino)) copyFileSync(destino, `${destino}.previa-${new Date().toISOString().replace(/[:.]/g, "-")}`);
  writeFileSync(destino, db);
  const restaurada = new AstroFactStore(nodeSqlite(destino));
  await registrarRestauracion(restaurada, manifiesto);
  console.log(`Copia del ${manifiesto.creada} restaurada. El evento de restauración se firmará al desbloquear el certificado.`);
}
