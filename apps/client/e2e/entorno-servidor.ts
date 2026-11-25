/**
 * Entorno E2E del modo servidor: simulador AEAT con mTLS (PKI de pruebas) + servidor AstroFact real
 * sirviendo la PWA. Escribe en stdout una línea JSON con las URLs y la ruta del .p12 de pruebas.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { arrancarSimulador, crearPki } from "@astrofact/aeat-sim";
import { crearServidor } from "../../server/src/app";

const dir = mkdtempSync(join(tmpdir(), "af-e2e-srv-"));
const pki = crearPki("89890001K");
const p12 = join(dir, "certificado-pruebas.p12"); writeFileSync(p12, pki.clienteP12);
const sim = await arrancarSimulador({ tls: { ...pki.servidor, ca: pki.caPem }, tiempoEsperaSeg: 1, xsdDir: resolve(process.cwd(), "../../docs/normativa/xsd") });
const app = await crearServidor({ dataDir: join(dir, "datos"), version: "e2e", webDir: resolve(process.cwd(), "dist"), aeatUrl: sim.url, aeatCa: pki.caPem, intervaloEnvioMs: 1000, secreto: "e2e".repeat(12) });
await app.listen({ port: Number(process.env.PORT ?? 4180), host: "127.0.0.1" });
console.log(JSON.stringify({ url: `http://127.0.0.1:${process.env.PORT ?? 4180}`, p12, pass: pki.clienteClave }));
