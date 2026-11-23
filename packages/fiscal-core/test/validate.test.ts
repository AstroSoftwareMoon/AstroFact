import { describe, expect, it } from "vitest";
import { tieneErrores, validarFactura } from "../src";
import { facturaEjemplo } from "./fixtures";

const HOY = "2025-06-01";
const codigos = (f: Parameters<typeof validarFactura>[0]) => validarFactura(f, HOY).map((i) => i.codigo);

describe("Validaciones de negocio (Validaciones VERI*FACTU v1.2.2)", () => {
  it("factura correcta sin incidencias", () => { expect(validarFactura(facturaEjemplo(), HOY)).toEqual([]); });
  it("NIF del emisor y destinatario", () => {
    expect(codigos(facturaEjemplo({ emisor: { nombre: "X", nif: "12345678A" } }))).toContain("EMISOR_NIF");
    expect(codigos(facturaEjemplo({ destinatarios: [{ nombre: "Y", nif: "B12345670" }] }))).toContain("DESTINATARIO_NIF");
  });
  it("fechas: futura, anterior al 28/10/2024 y operación posterior", () => {
    expect(codigos(facturaEjemplo({ fechaExpedicion: "2025-07-01" }))).toContain("FECHA_FUTURA");
    expect(codigos(facturaEjemplo({ fechaExpedicion: "2024-10-27" }))).toContain("FECHA_MINIMA");
    expect(codigos(facturaEjemplo({ fechaOperacion: "2025-03-01" }))).toContain("FECHA_OPERACION");
  });
  it("destinatarios obligatorios en F1 y prohibidos en F2", () => {
    expect(codigos(facturaEjemplo({ destinatarios: [] }))).toContain("DESTINATARIO_OBLIGATORIO");
    expect(codigos(facturaEjemplo({ tipoFactura: "F2" }))).toContain("DESTINATARIO_PROHIBIDO");
  });
  it("límite de simplificada (3.000 €) y aviso > 400 €", () => {
    const big = facturaEjemplo({ tipoFactura: "F2", destinatarios: [], lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "3000", tipo: "21" }] });
    expect(codigos(big)).toContain("F2_LIMITE");
    const mid = facturaEjemplo({ tipoFactura: "F2", destinatarios: [], lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "500", tipo: "21" }] });
    const v = validarFactura(mid, HOY);
    expect(v.map((i) => i.codigo)).toContain("F2_400");
    expect(tieneErrores(v)).toBe(false);
  });
  it("tipos de IVA y recargos admitidos según fecha", () => {
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "12" }] }))).toContain("TIPO_IVA");
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "5" }] }))).toContain("TIPO_IVA"); // 5 % solo hasta 30/09/2024
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "21", recargo: "1.4" }] }))).toContain("RECARGO");
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "10", recargo: "1.4" }] }))).toEqual([]);
  });
  it("rectificativas", () => {
    expect(codigos(facturaEjemplo({ tipoFactura: "R1" }))).toContain("RECT_TIPO");
    expect(codigos(facturaEjemplo({ tipoFactura: "R1", rectificacion: { tipo: "S", facturas: [] } }))).toContain("RECT_IMPORTE");
    expect(codigos(facturaEjemplo({ rectificacion: { tipo: "I", facturas: [] } }))).toContain("RECT_NO_PERMITIDA");
  });
  it("reglas de calificación / régimen", () => {
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", exenta: "E1", tipo: "21" }] }))).toContain("EXENTA_TIPO");
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", exenta: "E2" }] }))).toContain("EXENTA_CLAVE01");
    expect(codigos(facturaEjemplo({ tipoFactura: "F2", destinatarios: [], lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", calificacion: "S2" }] }))).toContain("S2_TIPO");
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "10", claveRegimen: "11" }] }))).toContain("ARRENDAMIENTO");
    expect(codigos(facturaEjemplo({ lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "21", claveRegimen: "02" }] }))).toContain("EXPORTACION");
  });
  it("número de serie con caracteres prohibidos", () => { expect(codigos(facturaEjemplo({ numSerie: "A=1" }))).toContain("NUMSERIE"); });
  it("máximo 12 líneas de desglose", () => {
    const lineas = Array.from({ length: 13 }, (_, i) => ({ descripcion: "x", cantidad: "1", precioUnitario: "1", tipo: "21", claveRegimen: (["01", "03", "04", "05", "06", "07", "09", "14", "15", "17", "18", "19", "20"] as const)[i] }));
    expect(codigos(facturaEjemplo({ fechaOperacion: undefined, lineas }))).toContain("DESGLOSE_MAX");
  });
});
