/**
 * E2E del modo «Solo facturas» (sin registros): asistente por defecto sin certificado, factura sin QR,
 * PDF sin QR y las 8 plantillas. Uso: node e2e/solo-facturas.cjs [--capturas] (requiere `vite build`).
 */
const { chromium } = require("playwright");
const { spawn, execFileSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");
const CAPTURAS = process.argv.includes("--capturas");
const OUT = path.resolve(__dirname, "../../../docs/assets");
const PORT = 4174;

(async () => {
  const srv = spawn("npx", ["vite", "preview", "--port", String(PORT), "--strictPort"], { cwd: path.resolve(__dirname, ".."), stdio: "ignore" });
  const errores = []; let browser;
  try {
    for (let i = 0; i < 100; i++) { try { if ((await fetch(`http://localhost:${PORT}/`)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 300)); }
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: CAPTURAS ? 2 : 1, locale: "es-ES", timezoneId: "Europe/Madrid", colorScheme: "dark" });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errores.push(e.message));
    page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
    const shot = async (n) => { if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.waitForTimeout(450); await page.screenshot({ path: path.join(OUT, `${n}.png`) }); } };
    await page.goto(`http://localhost:${PORT}/`);
    await page.getByRole("button", { name: /Español/ }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByRole("button", { name: "Siguiente" }).click();
    await page.getByPlaceholder("12345678Z").fill("89890001K");
    await page.getByPlaceholder("Mi Negocio SL").fill("Estudio Lunar SL");
    await page.getByPlaceholder("Calle, número").fill("C/ de la Luna 7");
    assert.ok(await page.getByTestId("modalidad-sin-registros").evaluate((e) => e.className.includes("ring-2")), "«Solo facturas» debe ser la opción por defecto");
    await shot("app-solo-facturas");
    await page.getByRole("button", { name: "Siguiente" }).click();      // → serie
    await page.getByRole("button", { name: "Siguiente" }).click();      // → seguridad (se salta el certificado)
    assert.equal(await page.getByText("Certificado de PRUEBAS").count(), 0);
    await page.getByRole("button", { name: "Empezar" }).click();
    await page.getByRole("button", { name: /Factura de ejemplo/ }).click({ timeout: 30000 });
    await page.getByTestId("importe-total").waitFor();
    await page.getByRole("button", { name: "Emitir factura" }).click();
    await page.getByTestId("confirmar-emision").click();
    await page.getByText(/no tiene registro de facturación/).waitFor({ timeout: 30000 });
    assert.equal(await page.getByTestId("qr-tributario").count(), 0, "no debe haber QR tributario");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("descargar-pdf").click()]);
    const pdf = path.join(require("node:os").tmpdir(), `af-solo-${Date.now()}.pdf`); await dl.saveAs(pdf);
    try { const txt = execFileSync("pdftotext", [pdf, "-"]).toString(); assert.ok(!txt.includes("QR tributario")); assert.ok(txt.includes("Estudio Lunar SL")); } catch (e) { if (e.code !== "ENOENT") throw e; }
    // Las 8 plantillas en el editor
    await page.goto(`http://localhost:${PORT}/#/ajustes`);
    for (const e of ["moderna", "clasica", "minimal", "elegante", "creativa", "corporativa", "nordica", "tecnica"]) await page.getByTestId(`estilo-${e}`).waitFor();
    await page.getByText("Solo facturas", { exact: false }).first().waitFor();
    await page.getByTestId("estilo-creativa").click();
    await page.locator("#plantilla").scrollIntoViewIfNeeded();
    if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.waitForTimeout(500); await page.locator("#plantilla").screenshot({ path: path.join(OUT, "app-plantillas.png") }); }
    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    assert.deepEqual(errores, [], "errores en consola: " + errores.join(" | "));
    console.log("✓ E2E «Solo facturas»: sin certificado, sin registro ni QR, 8 plantillas");
  } finally { await browser?.close(); srv.kill(); }
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
