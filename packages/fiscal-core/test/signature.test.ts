import { beforeAll, describe, expect, it } from "vitest";
import { cargarPkcs12, construirEvento, firmarRegistroXml, generarPkcs12Prueba, registroAltaXml, registroAnulacionXml, registroEventoXml, verificarFirmaXml, type Credencial } from "../src";
import { cadenaDeTres } from "./records.test";
import { SISTEMA } from "./fixtures";
import { validarXsd, xmllintDisponible } from "./helpers";

let cred: Credencial;
beforeAll(async () => {
  const p12 = generarPkcs12Prueba({ nif: "89890001K", nombre: "CERTIFICADO PRUEBAS", password: "secreto", bits: 2048 });
  cred = await cargarPkcs12(p12, "secreto");
});

describe("Firma XAdES-EPES (art. 14 Orden; especificación AEAT v0.1.5)", () => {
  it("carga PKCS#12 y extrae titular", () => {
    expect(cred.titular.nif).toBe("89890001K");
    expect(cred.bitsClave).toBe(2048);
  });
  it("contraseña incorrecta falla", async () => {
    const p12 = generarPkcs12Prueba({ nif: "89890001K", nombre: "X", password: "a", bits: 1024 });
    await expect(cargarPkcs12(p12, "b")).rejects.toThrow();
  });
  it("firma un RegistroAlta, verifica y detecta manipulación", async () => {
    const xml = await firmarRegistroXml(registroAltaXml(cadenaDeTres().a1), cred);
    expect(xml).toContain("urn:oid:2.16.724.1.3.1.1.2.1.9");
    expect(xml).toContain("G7roucf600+f03r/o0bAOQ6WAs0=");
    expect(xml).toContain("rsa-sha256");
    expect(xml).toContain("enveloped-signature");
    const v = await verificarFirmaXml(xml);
    expect(v).toMatchObject({ valida: true, politica: "urn:oid:2.16.724.1.3.1.1.2.1.9" });
    expect((await verificarFirmaXml(xml.replace("131.40", "131.41"))).valida).toBe(false);
  });
  it("certificado fuera de vigencia: no firma", async () => {
    await expect(firmarRegistroXml(registroAltaXml(cadenaDeTres().a1), cred, new Date("2000-01-01"))).rejects.toThrow(/vigor/);
  });
  it("rechaza firmar nodos superiores", async () => {
    await expect(firmarRegistroXml("<RegFactuSistemaFacturacion/>", cred)).rejects.toThrow(/no firmable/);
  });
  describe.skipIf(!xmllintDisponible())("XML firmado válido contra XSD", () => {
    it("RegistroAlta y RegistroAnulacion firmados", async () => {
      const { a1, b3 } = cadenaDeTres();
      expect(validarXsd(await firmarRegistroXml(registroAltaXml(a1), cred), "SuministroInformacion.xsd")).toBe("");
      expect(validarXsd(await firmarRegistroXml(registroAnulacionXml(b3), cred), "SuministroInformacion.xsd")).toBe("");
    });
    it("RegistroEvento firmado (firma en Evento/Signature, obligatoria en EventosSIF.xsd)", async () => {
      const ev = construirEvento({ sistema: SISTEMA, obligado: { NombreRazon: "Empresa", NIF: "89890001K" }, tipo: "01", fechaHoraGen: "2025-02-03T10:00:00+01:00", anterior: null });
      const xml = await firmarRegistroXml(registroEventoXml(ev), cred);
      expect(validarXsd(xml, "EventosSIF.xsd")).toBe("");
      expect((await verificarFirmaXml(xml)).valida).toBe(true);
    });
  });
});
