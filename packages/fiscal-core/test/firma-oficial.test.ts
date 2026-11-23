import { describe, expect, it } from "vitest";
import { verificarFirmaXml } from "../src";
import { ejemplo } from "./helpers";

describe("Firma — ejemplo oficial AEAT (AnexosEjemplosFirmaRegFact.zip)", () => {
  it("verifica criptográficamente el registro firmado de ejemplo", async () => {
    const r = await verificarFirmaXml(ejemplo("ejemploRegistro-firmado-epes-xades4j.xml"));
    expect(r.motivo).toBeUndefined();
    expect(r.valida).toBe(true);
    expect(r.politica).toBe("urn:oid:2.16.724.1.3.1.1.2.1.9");
  });
  it("detecta la manipulación del registro firmado", async () => {
    const xml = ejemplo("ejemploRegistro-firmado-epes-xades4j.xml").replace("<sum1:ImporteTotal>241.4<", "<sum1:ImporteTotal>241.5<");
    expect((await verificarFirmaXml(xml)).valida).toBe(false);
  });
});
