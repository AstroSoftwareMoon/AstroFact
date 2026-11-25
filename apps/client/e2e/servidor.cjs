/**
 * E2E modo servidor + VERI*FACTU: instalación del servidor, asistente, certificado, emisión,
 * envío automático al simulador de la AEAT (mTLS) y comprobación del estado y CSV en la interfaz.
 * Uso: node e2e/servidor.cjs [--capturas]  (requiere `vite build --mode web`)
 */
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");
const CAPTURAS = process.argv.includes("--capturas");
const OUT = path.resolve(__dirname, "../../../docs/assets");
const raiz = path.resolve(__dirname, "..");

(async () => {
  const dirOut = path.join(require("node:os").tmpdir(), "af-e2e-entorno");
  await require("tsup").build({ entry: { entorno: path.join(raiz, "e2e/entorno-servidor.ts") }, format: ["esm"], platform: "node", target: "node22", outDir: dirOut, clean: true, silent: true,
    config: false, dts: false, noExternal: [/^(?!@node-rs\/).*/], external: ["@node-rs/argon2"], removeNodeProtocol: false,
    banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } });
  const out = path.join(dirOut, "entorno.js");
  const fs = require("node:fs");
  fs.writeFileSync(path.join(dirOut, "package.json"), '{"type":"module"}');
  // argon2 es nativo: se copia junto al bundle (paquete principal + binario de la plataforma)
  const argon = path.dirname(require.resolve("@node-rs/argon2/package.json", { paths: [path.join(raiz, "../server")] }));
  fs.cpSync(argon, path.join(dirOut, "node_modules/@node-rs/argon2"), { recursive: true, dereference: true });
  const pnpmDir = path.resolve(fs.realpathSync(argon), "../..");
  for (const d of fs.readdirSync(pnpmDir)) if (d.startsWith("argon2-")) fs.cpSync(path.join(pnpmDir, d), path.join(dirOut, "node_modules/@node-rs", d), { recursive: true, dereference: true });
  for (const d of fs.readdirSync(path.resolve(fs.realpathSync(argon), "../../../.."))) { const m = /^@node-rs\+(argon2-[^@]+)@/.exec(d); if (m) fs.cpSync(path.resolve(fs.realpathSync(argon), "../../../..", d, "node_modules/@node-rs", m[1]), path.join(dirOut, "node_modules/@node-rs", m[1]), { recursive: true, dereference: true }); }
  const proc = spawn(process.execPath, ["--no-warnings", out], { cwd: raiz, stdio: ["ignore", "pipe", "inherit"], env: { ...process.env } });
  const info = await new Promise((res, rej) => { let b = ""; proc.stdout.on("data", (d) => { b += d; const l = b.split("\n").find((x) => x.startsWith("{\"url\"")); if (l) res(JSON.parse(l)); }); proc.on("exit", (c) => rej(new Error("El entorno terminó: " + c))); });
  const errores = [];
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURAS ? 2 : 1, locale: "es-ES", timezoneId: "Europe/Madrid", colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errores.push(e.message));
    const shot = async (n) => { if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${n}.png`) }); } };
    await page.goto(info.url);
    await page.getByRole("button", { name: /Español/ }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByTestId("uso-servidor").click();
    assert.equal(await page.getByTestId("url-servidor").inputValue(), info.url);
    await page.getByRole("button", { name: "Conectar" }).click();
    await page.getByLabel("Email").fill("duena@example.com");
    await page.getByLabel("Contraseña (mín. 10)").fill("una-clave-muy-larga");
    await page.getByLabel("Repite la contraseña").fill("una-clave-muy-larga");
    await shot("srv-instalacion");
    await page.getByRole("button", { name: /Crear cuenta/ }).click();
    // Asistente (negocio en el servidor)
    await page.getByPlaceholder("12345678Z").fill("89890001K");
    await page.getByPlaceholder("Mi Negocio SL").fill("Estudio Lunar SL");
    await page.getByTestId("modalidad-verifactu").click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: /Mi certificado/ }).click();
    await page.getByTestId("fichero-cert").setInputFiles(info.p12);
    await page.getByTestId("pass-cert").fill(info.pass);
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.getByRole("button", { name: /Factura de ejemplo/ }).click({ timeout: 30000 });
    await page.getByRole("button", { name: "Emitir factura" }).click();
    await page.getByTestId("confirmar-emision").click();
    await page.getByTestId("qr-tributario").waitFor({ timeout: 30000 });
    assert.match(await page.getByTestId("qr-tributario").innerText(), /Factura verificable en la sede electrónica de la AEAT/);
    // Espera al envío automático (servidor → simulador AEAT con mTLS)
    await page.getByText("Aceptada por la AEAT").first().waitFor({ timeout: 30000 });
    await shot("srv-factura-verifactu");
    await page.getByRole("link", { name: /Envíos AEAT/ }).first().click();
    await page.getByTestId("aeat-aceptado").filter({ hasText: "1" }).waitFor({ timeout: 15000 });
    assert.match(await page.getByTestId("csv").first().innerText(), /^SIM/);
    await shot("srv-envios");
    await page.getByRole("link", { name: /Ajustes/ }).first().click();
    await page.getByText("Usuarios del servidor").waitFor();
    if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.getByText("Usuarios del servidor").scrollIntoViewIfNeeded(); await page.waitForTimeout(400); await page.screenshot({ path: path.join(OUT, "srv-usuarios.png") }); }
    assert.deepEqual(errores, [], "errores en consola: " + errores.join(" | "));
    console.log("✓ E2E modo servidor + VERI*FACTU: instalación, emisión y envío aceptado por el simulador AEAT (mTLS)");
  } finally { await browser.close(); proc.kill(); }
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
