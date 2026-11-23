/** Ejemplos oficiales: "Detalle de las especificaciones técnicas del código QR" v0.5.0, apdos. 4 y 8. */
import { describe, expect, it } from "vitest";
import { importeQr, matrizQr, QR_LAYOUT, svgQr, urlQr } from "../src";

const base = { nif: "89890001K", numSerie: "12345678-G33", fechaExpedicion: "01-09-2024", importeTotal: "241.4" };

describe("QR tributario", () => {
  it("8.1 pruebas, VERI*FACTU", () => {
    expect(urlQr(base, { entorno: "pruebas", verifactu: true })).toBe("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678-G33&fecha=01-09-2024&importe=241.40");
  });
  it("8.2 pruebas, No VERI*FACTU", () => {
    expect(urlQr(base, { entorno: "pruebas", verifactu: false })).toBe("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=89890001K&numserie=12345678-G33&fecha=01-09-2024&importe=241.40");
  });
  it("8.3/8.4 producción", () => {
    expect(urlQr(base, { entorno: "produccion", verifactu: true })).toMatch(/^https:\/\/www2\.agenciatributaria\.gob\.es\/wlpl\/TIKE-CONT\/ValidarQR\?nif=/);
    expect(urlQr(base, { entorno: "produccion", verifactu: false })).toMatch(/ValidarQRNoVerifactu\?/);
  });
  it("4. URL encoding: numserie con & → %26 (ejemplo oficial)", () => {
    const u = urlQr({ ...base, numSerie: "12345678&G33", fechaExpedicion: "01-01-2024" }, { entorno: "pruebas", verifactu: true });
    expect(u).toBe("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=89890001K&numserie=12345678%26G33&fecha=01-01-2024&importe=241.40");
    expect(u).not.toMatch(/formato=/);
  });
  it("valida parámetros", () => {
    expect(() => urlQr({ ...base, fechaExpedicion: "2024-09-01" }, { entorno: "pruebas", verifactu: true })).toThrow();
    expect(() => urlQr({ ...base, numSerie: "Ñ1" }, { entorno: "pruebas", verifactu: true })).toThrow();
    expect(importeQr("-12.3")).toBe("-12.30");
  });
  it("matriz y SVG con nivel M y tamaño 30–40 mm", () => {
    const u = urlQr(base, { entorno: "pruebas", verifactu: true });
    const m = matrizQr(u);
    expect(m.length).toBeGreaterThanOrEqual(21);
    expect(m.length % 4).toBe(1); // tamaños QR: 17 + 4·versión
    const svg = svgQr(u);
    expect(svg).toContain('width="35mm"');
    expect(() => svgQr(u, 25)).toThrow();
    expect(QR_LAYOUT.nivelCorreccion).toBe("M");
    expect(QR_LAYOUT.textoSuperior).toBe("QR tributario:");
  });
});
