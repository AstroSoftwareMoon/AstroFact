import { describe, expect, it } from "vitest";
import { calcularTotales } from "../src";
import { facturaEjemplo } from "./fixtures";

describe("Cálculo de importes", () => {
  it("reproduce los totales del ejemplo oficial (CuotaTotal 21.4, ImporteTotal 131.4)", () => {
    const t = calcularTotales(facturaEjemplo());
    expect(t.cuotaTotal.toFixed(2)).toBe("21.40");
    expect(t.importeTotal.toFixed(2)).toBe("131.40");
    expect(t.desglose).toHaveLength(2);
  });
  // Nota: el ejemplo oficial del documento de firma (v0.1.5) declara CuotaTotal 41.4, pero la suma
  // de sus cuotas es 0.4 + 21 + 10 = 31.4 (dentro de la tolerancia de ±10 € de la AEAT). ImporteTotal 241.4 sí cuadra.
  it("desglose del documento de firma: 4 %, 21 % y 10 % (régimen 05) → 31.4 / 241.4", () => {
    const t = calcularTotales({ lineas: [
      { descripcion: "a", cantidad: "1", precioUnitario: "10", tipo: "4" },
      { descripcion: "b", cantidad: "1", precioUnitario: "100", tipo: "21" },
      { descripcion: "c", cantidad: "1", precioUnitario: "100", tipo: "10", claveRegimen: "05" },
    ] });
    expect(t.cuotaTotal.toFixed(2)).toBe("31.40");
    expect(t.importeTotal.toFixed(2)).toBe("241.40");
    expect(t.desglose.map((g) => g.claveRegimen)).toEqual(["01", "01", "05"]);
  });
  it("descuentos y redondeo de base por línea", () => {
    const t = calcularTotales({ lineas: [{ descripcion: "x", cantidad: "3", precioUnitario: "19.99", descuentoPct: "10", tipo: "21" }] });
    expect(t.baseTotal.toFixed(2)).toBe("53.97"); // 59.97 − 5.997 = 53.973
    expect(t.cuotaTotal.toFixed(2)).toBe("11.33");
  });
  it("redondeo por tipo vs por línea", () => {
    const lineas = Array.from({ length: 3 }, () => ({ descripcion: "x", cantidad: "1", precioUnitario: "0.05", tipo: "21" }));
    expect(calcularTotales({ lineas, redondeo: "por-tipo" }).cuotaTotal.toFixed(2)).toBe("0.03"); // 0.15·0.21 = 0.0315
    expect(calcularTotales({ lineas, redondeo: "por-linea" }).cuotaTotal.toFixed(2)).toBe("0.03"); // 3 × 0.0105→0.01
    const l2 = Array.from({ length: 3 }, () => ({ descripcion: "x", cantidad: "1", precioUnitario: "0.10", tipo: "21" }));
    expect(calcularTotales({ lineas: l2, redondeo: "por-tipo" }).cuotaTotal.toFixed(2)).toBe("0.06"); // 0.063
    expect(calcularTotales({ lineas: l2, redondeo: "por-linea" }).cuotaTotal.toFixed(2)).toBe("0.06"); // 3 × 0.021→0.02
  });
  it("recargo de equivalencia", () => {
    const t = calcularTotales({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "100", tipo: "21", recargo: "5.2" }] });
    expect(t.desglose[0]!.cuotaRecargo.toFixed(2)).toBe("5.20");
    expect(t.cuotaTotal.toFixed(2)).toBe("26.20");
    expect(t.importeTotal.toFixed(2)).toBe("126.20");
  });
  it("retención IRPF: no forma parte del ImporteTotal (FAQ AEAT), sí del total a pagar", () => {
    const t = calcularTotales({ retencionPct: "15", lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1000", tipo: "21" }] });
    expect(t.importeTotal.toFixed(2)).toBe("1210.00");
    expect(t.retencion.toFixed(2)).toBe("150.00");
    expect(t.totalAPagar.toFixed(2)).toBe("1060.00");
  });
  it("retención solo sobre líneas sujetas (p. ej. suplidos excluidos)", () => {
    const t = calcularTotales({ retencionPct: "7", lineas: [
      { descripcion: "honorarios", cantidad: "1", precioUnitario: "100", tipo: "21" },
      { descripcion: "otro", cantidad: "1", precioUnitario: "50", tipo: "21", sujetaRetencion: false },
    ] });
    expect(t.retencion.toFixed(2)).toBe("7.00");
  });
  it("inversión del sujeto pasivo (S2): tipo 0, cuota 0", () => {
    const t = calcularTotales({ lineas: [{ descripcion: "obra", cantidad: "1", precioUnitario: "1000", calificacion: "S2" }] });
    expect(t.desglose[0]!.tipo?.toPlain()).toBe("0");
    expect(t.cuotaTotal.isZero()).toBe(true);
    expect(t.importeTotal.toFixed(2)).toBe("1000.00");
  });
  it("exenta y no sujeta no generan cuota", () => {
    const t = calcularTotales({ lineas: [
      { descripcion: "formación", cantidad: "1", precioUnitario: "200", exenta: "E1" },
      { descripcion: "servicio UE", cantidad: "1", precioUnitario: "300", calificacion: "N2" },
    ] });
    expect(t.cuotaTotal.isZero()).toBe(true);
    expect(t.desglose).toHaveLength(2);
    expect(t.desglose[0]!.exenta).toBe("E1");
  });
  it("IGIC (impuesto 03) se agrupa aparte", () => {
    const t = calcularTotales({ lineas: [
      { descripcion: "a", cantidad: "1", precioUnitario: "100", impuesto: "03", tipo: "7" },
      { descripcion: "b", cantidad: "1", precioUnitario: "100", tipo: "7" },
    ] });
    expect(t.desglose).toHaveLength(2);
    expect(t.cuotaTotal.toFixed(2)).toBe("14.00");
  });
  it("rectificativa por diferencias con importes negativos", () => {
    const t = calcularTotales({ lineas: [{ descripcion: "devolución", cantidad: "-1", precioUnitario: "100", tipo: "21" }] });
    expect(t.importeTotal.toFixed(2)).toBe("-121.00");
  });
});
