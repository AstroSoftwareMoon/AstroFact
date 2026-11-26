import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import type { FacturaBorrador } from "@astrofact/fiscal-core";
import { datos } from "./muestra";
import { ESTILOS, generarFacturaPdf, type DatosPdf } from "../src";

const DPI = 300;
const herramientas = (() => { try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); return true; } catch { return false; } })();

function guardar(bytes: Uint8Array) { const d = mkdtempSync(join(tmpdir(), "afpdf-")); const f = join(d, "f.pdf"); writeFileSync(f, bytes); return { d, f }; }
function paginaPng(f: string, d: string, pagina: number) {
  const pref = join(d, `p${pagina}`);
  execFileSync("pdftoppm", ["-r", String(DPI), "-f", String(pagina), "-l", String(pagina), "-png", "-singlefile", f, pref]);
  return PNG.sync.read(readFileSync(`${pref}.png`));
}
const escanear = (png: PNG) => jsQR(new Uint8ClampedArray(png.data), png.width, png.height);
const texto = (f: string) => execFileSync("pdftotext", ["-layout", f, "-"]).toString();
const paginas = (f: string) => Number(/Pages:\s+(\d+)/.exec(execFileSync("pdfinfo", [f]).toString())![1]);

describe.skipIf(!herramientas)("Factura PDF", () => {
  for (const estilo of ESTILOS.map((e) => e.id)) {
    it(`QR legible, URL exacta, 30–40 mm, arriba y centrado — plantilla ${estilo}`, async () => {
      const dd = datos();
      const { d, f } = guardar(await generarFacturaPdf(dd, { estilo, colorAcento: "#00A3FF" }));
      expect(paginas(f)).toBe(1);
      const png = paginaPng(f, d, 1);
      const qr = escanear(png);
      expect(qr?.data).toBe(dd.qrUrl);
      const loc = qr!.location;
      const ladoMm = ((loc.topRightCorner.x - loc.topLeftCorner.x) / DPI) * 25.4;
      expect(ladoMm).toBeGreaterThanOrEqual(30); expect(ladoMm).toBeLessThanOrEqual(40);
      const cx = (loc.topLeftCorner.x + loc.topRightCorner.x) / 2;
      expect(Math.abs(cx - png.width / 2) / png.width).toBeLessThan(0.01);        // centrado
      expect(loc.topLeftCorner.y / png.height).toBeLessThan(0.12);              // en la parte superior
      const txt = texto(f);
      expect(txt.indexOf("QR tributario:")).toBeLessThan(txt.indexOf("A-2026-0042")); // el texto precede al resto del contenido
      for (const s of ["Estudio Lunar SL", "A-2026-0042", "Cliente Ejemplo SL", "Importe total factura", "762,30 €", "Total a pagar", "667,80 €", "Ñandú", "Página 1 de 1"]) expect(txt).toContain(s);
      expect(txt).not.toContain("Factura verificable");
    });
  }

  it("VERI*FACTU: leyenda bajo el QR y URL ValidarQR", async () => {
    const dd = datos({}, "verifactu");
    const { d, f } = guardar(await generarFacturaPdf(dd));
    expect(texto(f).replace(/\s+/g, " ")).toContain("Factura verificable en la sede electrónica de la AEAT");
    expect(escanear(paginaPng(f, d, 1))?.data).toMatch(/\/ValidarQR\?nif=89890001K/);
  });

  it("varias páginas: el QR aparece una sola vez, en la primera", async () => {
    const lineas = Array.from({ length: 70 }, (_, i) => ({ descripcion: `Servicio número ${i + 1} con una descripción algo más larga para forzar el salto de línea en la tabla de conceptos`, cantidad: "1", precioUnitario: "10", tipo: "21" }));
    const { d, f } = guardar(await generarFacturaPdf(datos({ lineas })));
    const n = paginas(f);
    expect(n).toBeGreaterThanOrEqual(3);
    expect(escanear(paginaPng(f, d, 1))).not.toBeNull();
    for (let p = 2; p <= n; p++) expect(escanear(paginaPng(f, d, p))).toBeNull();
    const txt = texto(f);
    expect(txt.match(/QR tributario:/g)).toHaveLength(1);
    expect(txt).toContain(`Página ${n} de ${n}`);
    expect(txt).toContain("(continuación)");
  });

  it("rectificativa, ISP y exenta: menciones obligatorias", async () => {
    const { f } = guardar(await generarFacturaPdf(datos({ tipoFactura: "R1", rectificacion: { tipo: "I", facturas: [{ IDEmisorFactura: "89890001K", NumSerieFactura: "A-2026-0001", FechaExpedicionFactura: "01-11-2026" }] },
      lineas: [{ descripcion: "Obra", cantidad: "1", precioUnitario: "100", calificacion: "S2" }, { descripcion: "Curso", cantidad: "1", precioUnitario: "50", exenta: "E1" }] })));
    const txt = texto(f);
    expect(txt).toContain("FACTURA RECTIFICATIVA");
    expect(txt).toContain("Rectifica a: A-2026-0001");
    expect(txt).toContain("inversión del sujeto pasivo");
    expect(txt).toContain("exenta");
  });

  it("logo PNG, pie legal, notas e IBAN; marca de agua de pruebas", async () => {
    const logo = new PNG({ width: 40, height: 20 }); logo.data.fill(80);
    const { f } = guardar(await generarFacturaPdf(datos(), { logo: { bytes: PNG.sync.write(logo), tipo: "png" }, pieLegal: "Inscrita en el Registro Mercantil de Madrid, tomo 1, folio 2", notas: "Gracias por tu confianza." }));
    const txt = texto(f);
    expect(txt).toContain("Registro Mercantil de Madrid");
    expect(txt).toContain("Gracias por tu confianza.");
    expect(txt).toContain("ES91 2100 0418");
    expect(execFileSync("pdftotext", ["-raw", f, "-"]).toString().replace(/\s+/g, "")).toContain("PRUEBAS-SINVALIDEZ");
  });

  it("modo «solo facturas» (sin registros): sin QR ni textos tributarios", async () => {
    const dd = { ...datos({}, "sin_registros"), qrUrl: "" };
    for (const { id } of ESTILOS) {
      const { d, f } = guardar(await generarFacturaPdf(dd, { estilo: id }));
      expect(escanear(paginaPng(f, d, 1))).toBeNull();
      const txt = texto(f);
      expect(txt).not.toContain("QR tributario");
      for (const s of ["Estudio Lunar SL", "A-2026-0042", "Total a pagar", "667,80 €"]) expect(txt).toContain(s);
    }
  });

  it("logo inválido no rompe la generación", async () => {
    await expect(generarFacturaPdf(datos(), { logo: { bytes: new Uint8Array([1, 2, 3]), tipo: "png" } })).resolves.toBeInstanceOf(Uint8Array);
  });
});
