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
    await page.getByTestId("modalidad-no-verifactu").click();
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

    // PDF: descarga y escaneo del QR (si hay poppler)
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("descargar-pdf").click()]);
    const pdfPath = path.join(require("node:os").tmpdir(), `af-e2e-${Date.now()}.pdf`);
    await dl.saveAs(pdfPath);
    assert.match(dl.suggestedFilename(), /^Factura-A-\d{4}-0001\.pdf$/);
    try {
      const { execFileSync } = require("node:child_process");
      execFileSync("pdftoppm", ["-r", "200", "-singlefile", "-png", pdfPath, pdfPath]);
      const { PNG } = require("pngjs"); const jsQR = require("jsqr");
      const png = PNG.sync.read(require("node:fs").readFileSync(pdfPath + ".png"));
      const qr = jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
      assert.match(qr && qr.data, /^https:\/\/prewww2\.aeat\.es\/wlpl\/TIKE-CONT\/ValidarQRNoVerifactu\?nif=89890001K&numserie=A-\d{4}-0001&fecha=\d{2}-\d{2}-\d{4}&importe=762\.30$/);
      console.log("  ✓ PDF descargado: QR legible →", qr.data);
    } catch (e) { if (e.code === "ENOENT") console.log("  (pdftoppm no disponible: se omite el escaneo del QR)"); else throw e; }

    // Registro fiscal → verificar integridad
    await page.getByRole("link", { name: /Registro fiscal/ }).click();
    await page.getByTestId("verificar-cadena").click();
    await page.getByTestId("cadena-ok").waitFor({ timeout: 30000 });
    await shot("app-registro");

    // Plantilla: cambiar a estilo clásico con otro color y guardar
    await page.getByRole("link", { name: /Ajustes/ }).first().click();
    await page.getByTestId("estilo-clasica").click();
    await page.getByRole("button", { name: "Color #0B7285" }).click();
    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    await page.locator("#plantilla").scrollIntoViewIfNeeded();
    if (CAPTURAS) { await page.addStyleTag({ content: "[aria-live=polite]{display:none!important}" }); await page.waitForTimeout(500); await page.locator("#plantilla").screenshot({ path: path.join(OUT, "app-plantilla.png") }); }

    // ---------------- Fase 6: gestión comercial ----------------
    const toastCon = (re) => page.locator("[aria-live=polite]").getByText(re).first().waitFor({ state: "attached", timeout: 15000 });
    // Gasto con adjunto
    await page.goto(`http://localhost:${PORT}/#/gastos`);
    await page.getByRole("button", { name: "Nuevo gasto" }).click();
    await page.getByLabel("Proveedor", { exact: true }).fill("Fibra Veloz SA");
    await page.getByLabel("NIF del proveedor").fill("B87654323");
    await page.getByLabel("Concepto", { exact: true }).fill("Fibra óptica");
    await page.getByLabel("Base 1").fill("100");
    await page.locator('input[type="file"]').setInputFiles({ name: "ticket.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
    await page.getByRole("button", { name: "Guardar gasto" }).click();
    await page.getByRole("cell", { name: "121,00 €" }).waitFor();
    await shot("app-gastos");

    // Presupuesto → albarán → factura
    await page.goto(`http://localhost:${PORT}/#/documentos/presupuesto`);
    await page.getByRole("button", { name: /Nuevo presupuesto/ }).click();
    await page.getByTestId("select-cliente").selectOption({ index: 1 });
    await page.getByPlaceholder("p. ej. Servicios de diseño de marzo").fill("Rediseño de la tienda online");
    await page.getByLabel("Concepto línea 1").fill("Rediseño web");
    await page.getByLabel("Precio línea 1").fill("1500");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("cell", { name: /^P-\d{4}-0001$/ }).waitFor();
    await shot("app-presupuestos");
    await page.getByRole("button", { name: "Aceptado" }).click();
    await page.getByRole("button", { name: "Albarán" }).click();
    await page.getByRole("cell", { name: /^AL-\d{4}-0001$/ }).waitFor();
    await page.getByLabel(/Seleccionar AL-/).check();
    await page.getByRole("button", { name: "Facturar juntos" }).click();
    await page.getByRole("button", { name: "Emitir factura" }).click();
    await page.getByTestId("qr-tributario").waitFor({ timeout: 30000 });
    assert.match(await page.locator("body").innerText(), /Rediseño web \(AL-\d{4}-0001\)/);

    // Cobro parcial y total
    await page.getByLabel("Importe cobrado").fill("500");
    await page.getByRole("button", { name: "Cobro", exact: true }).click();
    await toastCon("Cobro registrado");
    await page.goto(`http://localhost:${PORT}/#/cobros`);
    await page.getByText(/Pendientes de cobro/).waitFor();
    await shot("app-cobros");

    // Importar clientes desde CSV
    await page.goto(`http://localhost:${PORT}/#/importar`);
    await page.locator('input[type="file"]').setInputFiles({ name: "clientes.csv", mimeType: "text/csv", buffer: Buffer.from("Razón social;CIF;E-mail;C.P.;Población\nNebulosa SL;B46000014;hola@nebulosa.es;28001;Madrid\nMalo;B12345675;;;\n") });
    await page.getByText(/1 listos para importar/).waitFor();
    await page.getByRole("button", { name: "Importar 1" }).click();
    await toastCon("1 clientes importados");

    // Factura recurrente → procesar (borrador)
    await page.goto(`http://localhost:${PORT}/#/recurrentes`);
    await page.getByRole("button", { name: "Nueva" }).click();
    await page.getByPlaceholder("p. ej. Cuota mensual de mantenimiento").fill("Mantenimiento mensual");
    await page.getByTestId("select-cliente").selectOption({ index: 1 });
    await page.getByPlaceholder("p. ej. Servicios de diseño de marzo").fill("Mantenimiento web");
    await page.getByLabel("Concepto línea 1").fill("Mantenimiento");
    await page.getByLabel("Precio línea 1").fill("90");
    await page.getByRole("button", { name: "Guardar" }).click();
    await page.getByRole("cell", { name: "Mantenimiento mensual" }).waitFor();
    await page.getByRole("button", { name: "Procesar ahora" }).click();
    await toastCon(/0 emitidas · 1 borradores/);

    // Informes + paquete para el gestor
    await page.goto(`http://localhost:${PORT}/#/informes`);
    await page.getByRole("cell", { name: "IVA devengado" }).first().waitFor();
    await shot("app-informes");
    await page.getByRole("button", { name: "Paquete para el gestor" }).click();
    const [zipDl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), page.getByRole("button", { name: "Generar ZIP" }).click()]);
    const zipPath = path.join(require("node:os").tmpdir(), `af-gestor-${Date.now()}.zip`);
    await zipDl.saveAs(zipPath);
    const lista = require("node:child_process").execFileSync("python3", ["-c", "import sys,zipfile;print('\\n'.join(zipfile.ZipFile(sys.argv[1]).namelist()))", zipPath], { encoding: "utf8" });
    for (const n of ["LEEME.txt", "informes.xlsx", "libro-emitidas.csv", "libro-recibidas.csv"]) assert.ok(lista.includes(n), `falta ${n} en el paquete`);
    assert.ok(/facturas\/A-\d{4}-0002\.pdf/.test(lista), "faltan los PDF en el paquete");
    assert.ok(/gastos\/.*ticket\.pdf/.test(lista), "falta el adjunto del gasto en el paquete");
    console.log("  ✓ Paquete para el gestor:", lista.trim().split("\n").length, "ficheros");

    // ---------------- Fase 7: cumplimiento y copias de seguridad ----------------
    await page.goto(`http://localhost:${PORT}/#/cumplimiento`);
    await page.getByTestId("texto-legal").getByText(/DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN/).waitFor();
    assert.match(await page.getByTestId("texto-legal").innerText(), /Identificador completo de la versión concreta del sistema informático: \d+\.\d+\.\d+/);
    await page.getByText(/pendiente de suscribir/).waitFor();
    await shot("app-cumplimiento");
    await page.goto(`http://localhost:${PORT}/#/ajustes`);
    await page.getByLabel("Contraseña de la copia", { exact: true }).fill("copia-de-prueba");
    await page.getByLabel("Repetir contraseña de la copia").fill("copia-de-prueba");
    const [copiaDl] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Crear copia" }).click()]);
    assert.match(copiaDl.suggestedFilename(), /^astrofact-89890001K-\d{4}-\d{2}-\d{2}\.astro$/);
    const copiaPath = path.join(require("node:os").tmpdir(), `af-${Date.now()}.astro`); await copiaDl.saveAs(copiaPath);
    assert.ok(!require("node:fs").readFileSync(copiaPath).includes("Estudio Lunar"), "la copia no está cifrada");
    await page.getByRole("button", { name: /Restaurar una copia/ }).click();
    await page.locator('input[type="file"][accept=".astro"]').setInputFiles(copiaPath);
    await page.getByLabel("Contraseña de la copia").last().fill("copia-de-prueba");
    await page.getByRole("button", { name: "Comprobar copia" }).click();
    await page.getByText(/mismos registros de facturación/).waitFor();
    await page.getByTestId("confirmar-restauracion").click();
    await toastCon("Copia restaurada");
    await page.goto(`http://localhost:${PORT}/#/cumplimiento`);
    await page.getByText("Restauración de copia de seguridad").first().waitFor();
    console.log("  ✓ Copia .astro creada, comprobada y restaurada (evento 07)");

    await page.getByRole("link", { name: /Panel/ }).first().click();
    await page.waitForTimeout(300);
    await shot("app-panel");

    if (CAPTURAS) {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`http://localhost:${PORT}/#/`); await page.waitForTimeout(600);
      await shot("app-movil-panel");
      await page.goto(`http://localhost:${PORT}/#/facturas/nueva`); await page.waitForTimeout(600);
      await shot("app-movil-nueva");
      await page.getByRole("button", { name: "Más secciones" }).click(); await page.waitForTimeout(300);
      await shot("app-movil-mas");
      await page.getByRole("button", { name: "Más secciones" }).click();
      // Tema claro
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.evaluate(() => { localStorage.setItem("af:tema", "claro"); });
      await page.goto(`http://localhost:${PORT}/#/facturas`); await page.reload(); await page.waitForTimeout(900);
      await shot("app-claro");
      await page.evaluate(() => { localStorage.setItem("af:tema", "oscuro"); });
    }
    assert.deepEqual(errores, [], "errores en consola: " + errores.join(" | "));
    console.log("✓ E2E emisión No VERI*FACTU con QR y verificación de cadena");
  } finally {
    await browser?.close();
    srv.kill();
  }
})().catch((e) => { console.error("✗", e.message); process.exit(1); });
