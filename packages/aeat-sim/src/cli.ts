// Uso: pnpm --filter @astrofact/aeat-sim build && node packages/aeat-sim/dist/cli.js [puerto]  → simulador HTTP en 0.0.0.0:puerto (para desarrollo)
import { resolve } from "node:path";
import { arrancarSimulador } from "./servidor";
const s = await arrancarSimulador({ puerto: Number(process.argv[2] ?? 8443), host: "0.0.0.0", xsdDir: process.env.XSD_DIR ?? resolve(import.meta.dirname, "../../../docs/normativa/xsd"), tiempoEsperaSeg: Number(process.env.TIEMPO_ESPERA ?? 5) });
console.log(`Simulador AEAT (NO es la AEAT) escuchando en ${s.url}`);
