import { describe, expect, it } from "vitest";
import { marcasAlta, marcasAnulacion, resultadoCuadro, textoErrorAeat } from "../src";

describe("Operativa oficial de alta y anulación (cuadros A y B)", () => {
  it("marcas por situación", () => {
    expect(marcasAlta("nuevo")).toEqual({});
    expect(marcasAlta("rechazado")).toEqual({ Subsanacion: "S", RechazoPrevio: "X" });
    expect(marcasAlta("aceptado")).toEqual({ Subsanacion: "S" });
    expect(marcasAlta("subsanacion_rechazada")).toEqual({ Subsanacion: "S", RechazoPrevio: "S" });
    expect(marcasAnulacion("sin_registro_previo")).toEqual({ SinRegistroPrevio: "S" });
    expect(marcasAnulacion("rechazada")).toEqual({ RechazoPrevio: "S" });
  });
  it("cuadro de alta: OK(1), ERROR(2), ERROR(3), OK(4), OK(5)", () => {
    expect(resultadoCuadro({ tipo: "alta" }, "no_existe")).toMatchObject({ ok: true, nota: 1 });
    expect(resultadoCuadro({ tipo: "alta" }, "alta")).toMatchObject({ ok: false, nota: 2, codigo: 3000 });
    expect(resultadoCuadro({ tipo: "alta", Subsanacion: "S" }, "no_existe")).toMatchObject({ ok: false, nota: 3 });
    expect(resultadoCuadro({ tipo: "alta", Subsanacion: "S" }, "alta")).toMatchObject({ ok: true, nota: 4 });
    expect(resultadoCuadro({ tipo: "alta", Subsanacion: "S" }, "anulada")).toMatchObject({ ok: true, nota: 5 });
    expect(resultadoCuadro({ tipo: "alta", Subsanacion: "S", RechazoPrevio: "X" }, "no_existe")).toMatchObject({ ok: true });
    expect(resultadoCuadro({ tipo: "alta", RechazoPrevio: "S" }, "no_existe").ok).toBe(false); // L17: no se admite S sin subsanación
  });
  it("cuadro de anulación: ERROR(6), OK(7), OK(8), OK(9), ERROR(10)", () => {
    expect(resultadoCuadro({ tipo: "anulacion" }, "no_existe")).toMatchObject({ ok: false, nota: 6 });
    expect(resultadoCuadro({ tipo: "anulacion" }, "alta")).toMatchObject({ ok: true, nota: 7 });
    expect(resultadoCuadro({ tipo: "anulacion" }, "anulada")).toMatchObject({ ok: true, nota: 8 });
    expect(resultadoCuadro({ tipo: "anulacion", SinRegistroPrevio: "S" }, "no_existe")).toMatchObject({ ok: true, nota: 9 });
    expect(resultadoCuadro({ tipo: "anulacion", SinRegistroPrevio: "S" }, "alta")).toMatchObject({ ok: false, nota: 10 });
  });
  it("textos oficiales de error", () => {
    expect(textoErrorAeat(3000)).toBe("Registro de facturación duplicado.");
    expect(textoErrorAeat(2000)).toBe("El cálculo de la huella suministrada es incorrecta.");
    expect(textoErrorAeat(999999)).toBe("Error 999999");
  });
});
