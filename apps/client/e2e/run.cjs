/**
 * E2E de emisión No VERI*FACTU (Playwright). Recorre el asistente, emite la factura de ejemplo con
 * certificado de PRUEBAS, comprueba el QR tributario y la verificación de la cadena.
 * Uso: node e2e/run.cjs [--capturas]   (requiere `vite build` previo; levanta `vite preview`)
 */
const { chromium } = require("playwright");
const { spawn } = require("node:child_process");
const path = require("node:path");
const assert = require("node:assert/strict");

const CAPTURAS = process.argv.includes("--capturas");
const OUT = path.resolve(__dirname, "../../../docs/assets");
const PORT = 4173;

async function esperarServidor(url, ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const r = await fetch(url); if (r.ok) return; } catch {} await new Promise((r) => setTimeout(r, 300)); }
  throw new Error("El servidor no arrancó");
}

(async () => {
  const srv = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });
  const errores = [];
  let browser;
  try {
    await esperarServidor(`http://localhost:${PORT}/`);
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURAS ? 2 : 1, locale: "es-ES", timezoneId: "Europe/Madrid", colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    const shot = async (n) => { if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${n}.png`) }); } };
    await page.goto(`http://localhost:${PORT}/`);

    // Asistente de bienvenida
    await page.getByRole("button", { name: /Español/ }).click();
    await shot("app-bienvenida");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByPlaceholder("12345678Z").fill("89890001K");
    await page.getByPlaceholder("Mi Negocio SL").fill("Estudio Lunar SL");
    await page.getByPlaceholder("Calle, número").fill("C/ de la Luna 7");
    await shot("app-negocio");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: /Certificado de PRUEBAS/ }).click();
    await page.locator('input[type="password"]').fill("clave-de-pruebas");
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.getByRole("button", { name: /Factura de ejemplo/ }).click({ timeout: 30000 });

    // Nueva factura (ejemplo) → emitir
    await page.getByTestId("importe-total").waitFor();
    assert.equal((await page.getByTestId("importe-total").innerText()).replace(/\s/g, " "), "762,30 €");
    await shot("app-nueva-factura");
    await page.getByRole("button", { name: "Emitir factura" }).click();
    await page.getByTestId("confirmar-emision").click();
    await page.getByTestId("qr-tributario").waitFor({ timeout: 30000 });
    const qrTexto = await page.getByTestId("qr-tributario").innerText();
    assert.match(qrTexto, /QR tributario:/);
    assert.ok(await page.locator('[data-testid="qr-tributario"] svg').count() === 1, "falta el SVG del QR");
    await shot("app-factura");

    // Registro fiscal → verificar integridad
    await page.getByRole("link", { name: /Registro fiscal/ }).click();
    await page.getByTestId("verificar-cadena").click();
    await page.getByTestId("cadena-ok").waitFor({ timeout: 30000 });
    await shot("app-registro");

    await page.getByRole("link", { name: /Panel/ }).first().click();
    await page.waitForTimeout(300);
    await shot("app-panel");

    if (CAPTURAS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`http://localhost:${PORT}/#/`); await page.waitForTimeout(600);
      await shot("app-movil-panel");
      await page.goto(`http://localhost:${PORT}/#/facturas/nueva`); await page.waitForTimeout(600);
      await shot("app-movil-nueva");
    }
    assert.deepEqual(errores, [], "errores en consola: " + errores.join(" | "));
    console.log("✓ E2E emisión No VERI*FACTU con QR y verificación de cadena");
  } finally {
    await browser?.close();
    srv.kill();
  }
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
