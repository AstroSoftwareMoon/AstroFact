import { describe, expect, it } from "vitest";
import {
  cabezaDe, construirRegistroAlta, construirRegistroAnulacion, exportarRegistros, recalcularHuella, regFactuXml,
  registroAltaXml, registroAnulacionXml, sobreSoap, type RegistroFacturacion,
} from "../src";
import { CLIENTE, EMISOR, facturaEjemplo, SISTEMA } from "./fixtures";
import { validarXsd, xmllintDisponible } from "./helpers";

const T0 = "2025-02-03T10:00:00+01:00";

function cadenaDeTres() {
  const a1 = construirRegistroAlta({ factura: facturaEjemplo(), sistema: SISTEMA, anterior: null, fechaHoraGen: T0 }).registro;
  const a2 = construirRegistroAlta({ factura: facturaEjemplo({ numSerie: "A-2025-0002" }), sistema: SISTEMA, anterior: cabezaDe({ tipo: "alta", registro: a1 }), fechaHoraGen: "2025-02-03T10:00:05+01:00" }).registro;
  const b3 = construirRegistroAnulacion({ factura: a2.IDFactura, sistema: SISTEMA, anterior: cabezaDe({ tipo: "alta", registro: a2 }), fechaHoraGen: "2025-02-03T10:00:10+01:00" });
  const regs: RegistroFacturacion[] = [{ tipo: "alta", registro: a1 }, { tipo: "alta", registro: a2 }, { tipo: "anulacion", registro: b3 }];
  return { a1, a2, b3, regs };
}

describe("Registros de facturación", () => {
  it("alta: campos, totales, primer registro y huella", () => {
    const { a1 } = cadenaDeTres();
    expect(a1.IDFactura).toEqual({ IDEmisorFactura: "89890001K", NumSerieFactura: "A-2025-0001", FechaExpedicionFactura: "03-02-2025" });
    expect(a1.CuotaTotal).toBe("21.40");
    expect(a1.ImporteTotal).toBe("131.40");
    expect(a1.Encadenamiento).toEqual({ PrimerRegistro: "S" });
    expect(a1.Huella).toMatch(/^[0-9A-F]{64}$/);
    expect(recalcularHuella({ tipo: "alta", registro: a1 })).toBe(a1.Huella);
    expect(a1.Desglose[1]).toMatchObject({ Impuesto: "01", ClaveRegimen: "01", CalificacionOperacion: "S1", TipoImpositivo: "21", BaseImponibleOimporteNoSujeto: "100.00", CuotaRepercutida: "21.00" });
  });
  it("encadenado: el segundo referencia al primero y la anulación al segundo", () => {
    const { a1, a2, b3 } = cadenaDeTres();
    expect(a2.Encadenamiento).toEqual({ RegistroAnterior: { ...a1.IDFactura, Huella: a1.Huella } });
    expect("RegistroAnterior" in b3.Encadenamiento && b3.Encadenamiento.RegistroAnterior.Huella).toBe(a2.Huella);
    expect(b3.IDFactura.NumSerieFacturaAnulada).toBe("A-2025-0002");
  });
  it("la huella de la anulación coincide con el método oficial (mismos campos que el caso 3)", () => {
    const b = construirRegistroAnulacion({ factura: { IDEmisorFactura: "89890001K", NumSerieFactura: "12345679/G34", FechaExpedicionFactura: "01-01-2024" }, sistema: SISTEMA,
      anterior: { IDEmisorFactura: "89890001K", NumSerieFactura: "12345679/G34", FechaExpedicionFactura: "01-01-2024", Huella: "F7B94CFD8924EDFF273501B01EE5153E4CE8F259766F88CF6ACB8935802A2B97", FechaHoraHusoGenRegistro: "" },
      fechaHoraGen: "2024-01-01T19:20:40+01:00" });
    expect(b.Huella).toBe("177547C0D57AC74748561D054A9CEC14B4C4EA23D1BEFD6F2E69E3A388F90C68");
  });
  it("rectificativa por sustitución incluye ImporteRectificacion y FacturasRectificadas", () => {
    const r = construirRegistroAlta({ sistema: SISTEMA, anterior: null, fechaHoraGen: T0, factura: facturaEjemplo({
      tipoFactura: "R1", numSerie: "R-2025-0001",
      rectificacion: { tipo: "S", facturas: [{ IDEmisorFactura: "89890001K", NumSerieFactura: "A-2025-0001", FechaExpedicionFactura: "03-02-2025" }], importeRectificacion: { baseRectificada: "110", cuotaRectificada: "21.4" } },
    }) }).registro;
    expect(r.TipoRectificativa).toBe("S");
    expect(r.ImporteRectificacion).toEqual({ BaseRectificada: "110.00", CuotaRectificada: "21.40" });
    expect(r.FacturasRectificadas).toHaveLength(1);
  });
  it("simplificada sin destinatario y FechaOperacion solo si difiere", () => {
    const r = construirRegistroAlta({ sistema: SISTEMA, anterior: null, fechaHoraGen: T0, factura: facturaEjemplo({ tipoFactura: "F2", destinatarios: [], fechaOperacion: "2025-02-01" }) }).registro;
    expect(r.Destinatarios).toBeUndefined();
    expect(r.FechaOperacion).toBe("01-02-2025");
  });

  describe.skipIf(!xmllintDisponible())("validación contra los XSD oficiales", () => {
    it("RegistroAlta y RegistroAnulacion autónomos (SuministroInformacion.xsd)", () => {
      const { a1, b3 } = cadenaDeTres();
      expect(validarXsd(registroAltaXml(a1), "SuministroInformacion.xsd")).toBe("");
      expect(validarXsd(registroAnulacionXml(b3), "SuministroInformacion.xsd")).toBe("");
    });
    it("RegFactuSistemaFacturacion con alta + anulación (SuministroLR.xsd)", () => {
      const { regs } = cadenaDeTres();
      const xml = regFactuXml({ ObligadoEmision: { NombreRazon: EMISOR.nombre, NIF: EMISOR.nif }, RemisionVoluntaria: { Incidencia: "N" } }, regs);
      expect(validarXsd(xml, "SuministroLR.xsd")).toBe("");
    });
    it("tipos complejos: S2, exenta, no sujeta, recargo, extranjero IDOtro, rectificativa", () => {
      const r = construirRegistroAlta({ sistema: SISTEMA, anterior: null, fechaHoraGen: T0, factura: facturaEjemplo({
        tipoFactura: "R4", numSerie: "R/2025/7",
        destinatarios: [CLIENTE, { nombre: "Client SARL", idOtro: { codigoPais: "FR", idType: "02", id: "FR12345678901" } }],
        rectificacion: { tipo: "I", facturas: [{ IDEmisorFactura: "89890001K", NumSerieFactura: "A-2025-0001", FechaExpedicionFactura: "03-02-2025" }] },
        lineas: [
          { descripcion: "a", cantidad: "1", precioUnitario: "100", calificacion: "S2" },
          { descripcion: "b", cantidad: "1", precioUnitario: "100", exenta: "E1" },
          { descripcion: "c", cantidad: "1", precioUnitario: "100", calificacion: "N2" },
          { descripcion: "d", cantidad: "-1", precioUnitario: "100", tipo: "21", recargo: "5.2" },
        ] }) }).registro;
      expect(validarXsd(registroAltaXml(r), "SuministroInformacion.xsd")).toBe("");
    });
    it("caracteres especiales escapados (& < >) siguen siendo XML válido", () => {
      const r = construirRegistroAlta({ sistema: SISTEMA, anterior: null, fechaHoraGen: T0, factura: facturaEjemplo({ numSerie: "A&B-1", descripcionOperacion: "Obras <urgentes> & reparación" }) }).registro;
      const xml = registroAltaXml(r);
      expect(xml).toContain("A&amp;B-1");
      expect(validarXsd(xml, "SuministroInformacion.xsd")).toBe("");
    });
    it("exportación por lotes válida contra XSD", () => {
      const { regs } = cadenaDeTres();
      const ex = exportarRegistros({ NombreRazon: EMISOR.nombre, NIF: EMISOR.nif }, regs);
      expect(ex.ficheros).toHaveLength(1);
      expect(ex.resumen).toMatchObject({ numAltas: 2, numAnulaciones: 1, sumaCuotaTotalAlta: "42.80", sumaImporteTotalAlta: "262.80" });
      expect(validarXsd(ex.ficheros[0]!.contenido, "SuministroLR.xsd")).toBe("");
    });
  });

  it("sobre SOAP: estructura y límites", () => {
    const { regs } = cadenaDeTres();
    const soap = sobreSoap({ ObligadoEmision: { NombreRazon: EMISOR.nombre, NIF: EMISOR.nif } }, regs);
    expect(soap).toContain("<soapenv:Envelope");
    expect(soap).toContain("<sum:RegFactuSistemaFacturacion>");
    expect(soap.match(/<sum:RegistroFactura>/g)).toHaveLength(3);
    expect(() => sobreSoap({ ObligadoEmision: { NombreRazon: "X", NIF: "B12345674" } }, regs)).toThrow(/ObligadoEmision/);
    expect(() => sobreSoap({ ObligadoEmision: { NombreRazon: "X", NIF: "89890001K" } }, [])).toThrow();
  });
});

export { cadenaDeTres };
