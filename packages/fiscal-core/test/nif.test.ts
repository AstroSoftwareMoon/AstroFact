import { describe, expect, it } from "vitest";
import { isValidNif, validateEuVat, validateNif } from "../src";

describe("NIF / NIE / CIF", () => {
  it("NIF de los ejemplos oficiales AEAT", () => { expect(isValidNif("89890001K")).toBe(true); expect(isValidNif("89890002E")).toBe(true); });
  it("DNI", () => { expect(validateNif("12345678Z").kind).toBe("DNI"); expect(isValidNif("12345678A")).toBe(false); expect(isValidNif("12.345.678-z")).toBe(true); });
  it("NIE", () => { expect(validateNif("X1234567L").kind).toBe("NIE"); expect(isValidNif("Y1234567X")).toBe(true); expect(isValidNif("Z1234567R")).toBe(true); expect(isValidNif("X1234567A")).toBe(false); });
  it("NIF de entidades", () => {
    expect(validateNif("B12345674").kind).toBe("CIF");   // control numérico
    expect(isValidNif("A58818501")).toBe(true);
    expect(isValidNif("Q2826004J")).toBe(true);           // control con letra (FNMT, en el certificado oficial de ejemplo)
    expect(isValidNif("B12345670")).toBe(false);
    expect(isValidNif("P2800000A")).toBe(false);
  });
  it("longitud y formato", () => { expect(validateNif("123").valid).toBe(false); expect(validateNif("ÑÑÑÑÑÑÑÑÑ").valid).toBe(false); });
  it("NIF-IVA comunitario (estructura oficial)", () => {
    expect(validateEuVat("FR12345678901")).toBe(true);
    expect(validateEuVat("DE123456789")).toBe(true);
    expect(validateEuVat("DE12345678")).toBe(false);
    expect(validateEuVat("PT123456789")).toBe(true);
    expect(validateEuVat("ESB12345674")).toBe(true);
    expect(validateEuVat("XX123")).toBe(false);
  });
});
