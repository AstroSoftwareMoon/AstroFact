/**
 * Vectores oficiales: AEAT "Especificaciones técnicas para generación de la huella o hash",
 * v0.1.2, apdo. 6 (casos 1, 2 y 3), y registro de ejemplo del documento de firma v0.1.5.
 */
import { describe, expect, it } from "vitest";
import { calcularHuella, hashInputAlta, hashInputAnulacion, hashInputEvento, huellaAlta, huellaAnulacion, isHuellaFormat } from "../src";

describe("Huella — vectores oficiales AEAT", () => {
  it("Caso 1: primer registro de alta", () => {
    const input = { IDEmisorFactura: "89890001K", NumSerieFactura: "12345678/G33", FechaExpedicionFactura: "01-01-2024", TipoFactura: "F1", CuotaTotal: "12.35", ImporteTotal: "123.45", Huella: "", FechaHoraHusoGenRegistro: "2024-01-01T19:20:30+01:00" };
    expect(hashInputAlta(input)).toBe("IDEmisorFactura=89890001K&NumSerieFactura=12345678/G33&FechaExpedicionFactura=01-01-2024&TipoFactura=F1&CuotaTotal=12.35&ImporteTotal=123.45&Huella=&FechaHoraHusoGenRegistro=2024-01-01T19:20:30+01:00");
    expect(huellaAlta(input)).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });
  it("Caso 2: segundo registro de alta encadenado", () => {
    expect(huellaAlta({ IDEmisorFactura: "89890001K", NumSerieFactura: "12345679/G34", FechaExpedicionFactura: "01-01-2024", TipoFactura: "F1", CuotaTotal: "12.35", ImporteTotal: "123.45",
      Huella: "3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60", FechaHoraHusoGenRegistro: "2024-01-01T19:20:35+01:00" }))
      .toBe("F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97");
  });
  it("Caso 3: registro de anulación encadenado", () => {
    const input = { IDEmisorFacturaAnulada: "89890001K", NumSerieFacturaAnulada: "12345679/G34", FechaExpedicionFacturaAnulada: "01-01-2024",
      Huella: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97", FechaHoraHusoGenRegistro: "2024-01-01T19:20:40+01:00" };
    expect(hashInputAnulacion(input)).toBe("IDEmisorFacturaAnulada=89890001K&NumSerieFacturaAnulada=12345679/G34&FechaExpedicionFacturaAnulada=01-01-2024&Huella=F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97&FechaHoraHusoGenRegistro=2024-01-01T19:20:40+01:00");
    expect(huellaAnulacion(input)).toBe("177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68");
  });
  it("Registro de ejemplo del documento de firma (R3, CuotaTotal 41.4, ImporteTotal 241.4)", () => {
    expect(huellaAlta({ IDEmisorFactura: "89890001K", NumSerieFactura: "12345678-G66", FechaExpedicionFactura: "03-02-2025", TipoFactura: "R3", CuotaTotal: "41.4", ImporteTotal: "241.4",
      Huella: "C9AF4AF1EF5EBBA700350DE3EEF12C2D355C56AC56F13DB2A25E0031BD2B7ED5", FechaHoraHusoGenRegistro: "2025-02-03T14:30:00+01:00" }))
      .toBe("FF954378B64ED331A9B2366AD317D86E9DEC1716B12DD0ACCB172A6DC4C105AA");
  });
  it("elimina espacios iniciales y finales de los valores", () => {
    const a = huellaAlta({ IDEmisorFactura: " 89890001K ", NumSerieFactura: " 12345678/G33 ", FechaExpedicionFactura: "01-01-2024", TipoFactura: "F1", CuotaTotal: "12.35", ImporteTotal: "123.45", FechaHoraHusoGenRegistro: "2024-01-01T19:20:30+01:00" });
    expect(a).toBe("3C464DAF61ACB827C65FDA19F352A4E3BDC2C640E9E9FC4CC058073F38F12F60");
  });
  it("evento: NIF informado e ID vacío según el ejemplo de la especificación", () => {
    expect(hashInputEvento({ NIF: "89890001K", IdSistemaInformatico: "AF", Version: "1.0", NumeroInstalacion: "1", NIFObligado: "89890002E", TipoEvento: "01", FechaHoraHusoGenEvento: "2025-01-01T10:00:00+01:00" }))
      .toBe("NIF=89890001K&ID=&IdSistemaInformatico=AF&Version=1.0&NumeroInstalacion=1&NIF=89890002E&TipoEvento=01&HuellaEvento=&FechaHoraHusoGenEvento=2025-01-01T10:00:00+01:00");
  });
  it("formato de salida: 64 hex en mayúsculas", () => {
    expect(isHuellaFormat(calcularHuella("x"))).toBe(true);
    expect(isHuellaFormat("abc")).toBe(false);
  });
});
