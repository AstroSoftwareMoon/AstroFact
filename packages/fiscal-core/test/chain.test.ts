import { describe, expect, it } from "vitest";
import { comprobarAntesDeGenerar, saltar, verificarCadena, type RegistroFacturacion } from "../src";
import { cadenaDeTres } from "./records.test";

const AHORA = new Date("2025-02-03T12:00:00+01:00");
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe("Cadena de registros (arts. 6 y 7 Orden)", () => {
  it("cadena íntegra", async () => {
    const r = await verificarCadena(cadenaDeTres().regs, { ahora: AHORA });
    expect(r.anomalias).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.registrosComprobados).toBe(3);
  });
  it("01 — manipulación de un importe", async () => {
    const regs = clone(cadenaDeTres().regs);
    (regs[0]!.registro as any).ImporteTotal = "999.00";
    const r = await verificarCadena(regs, { ahora: AHORA });
    expect(r.anomalias.map((a) => [a.indice, a.tipo])).toContainEqual([0, "01"]);
  });
  it("08 — huella del anterior alterada / 01 en el propio registro", async () => {
    const regs = clone(cadenaDeTres().regs);
    (regs[1]!.registro.Encadenamiento as any).RegistroAnterior.Huella = "0".repeat(64);
    const tipos = (await verificarCadena(regs, { ahora: AHORA })).anomalias.map((a) => a.tipo);
    expect(tipos).toContain("08");
    expect(tipos).toContain("01");
  });
  it("04 — registro eliminado de la cadena", async () => {
    const regs = clone(cadenaDeTres().regs);
    regs.splice(1, 1);
    const tipos = (await verificarCadena(regs, { ahora: AHORA })).anomalias.map((a) => a.tipo);
    expect(tipos).toContain("04");
    expect(tipos).toContain("08");
  });
  it("06 — PrimerRegistro en mitad de la cadena", async () => {
    const regs = clone(cadenaDeTres().regs);
    regs.unshift(clone(regs[0]!));
    expect((await verificarCadena(regs, { ahora: AHORA })).anomalias.map((a) => a.tipo)).toContain("06");
  });
  it("11 y 13 — fechas fuera de orden o en el futuro", async () => {
    const { regs } = cadenaDeTres();
    const r = await verificarCadena([regs[1]!, regs[0]!] as RegistroFacturacion[], { ahora: AHORA, tramoIntermedio: true });
    expect(r.anomalias.map((a) => a.tipo)).toContain("11");
    const fut = await verificarCadena(regs, { ahora: new Date("2025-02-03T09:00:00+01:00") });
    expect(fut.anomalias.map((a) => a.tipo)).toContain("13");
  });
  it("02 — firma inválida a través del verificador inyectado", async () => {
    const r = await verificarCadena(cadenaDeTres().regs, { ahora: AHORA, verificarFirma: (i) => i !== 2 });
    expect(r.anomalias).toEqual([expect.objectContaining({ indice: 2, tipo: "02" })]);
  });
  it("verificación parcial de un tramo", async () => {
    const r = await verificarCadena(cadenaDeTres().regs, { ahora: AHORA, desde: 1, hasta: 2 });
    expect(r.ok).toBe(true);
    expect(r.registrosComprobados).toBe(2);
  });
  it("navegación adelante/atrás (art. 7.h)", () => {
    const { regs } = cadenaDeTres();
    expect(saltar(regs, 1, "anterior", AHORA)).toEqual({ desde: 1, hacia: 0, huellaCorrecta: true, ordenTemporalCorrecto: true });
    expect(saltar(regs, 1, "posterior", AHORA)?.huellaCorrecta).toBe(true);
    expect(saltar(regs, 0, "anterior", AHORA)).toBeNull();
    expect(saltar(regs, 2, "posterior", AHORA)).toBeNull();
    const t = clone(regs); (t[0]!.registro as any).CuotaTotal = "1.00";
    expect(saltar(t, 1, "anterior", AHORA)?.huellaCorrecta).toBe(false);
  });
  it("comprobaciones antes de generar (art. 7.i)", () => {
    const { regs } = cadenaDeTres();
    expect(comprobarAntesDeGenerar(regs[2]!, regs[1]!, AHORA).ok).toBe(true);
    expect(comprobarAntesDeGenerar(null, null, AHORA).ok).toBe(true);
    expect(comprobarAntesDeGenerar(regs[2]!, regs[1]!, new Date("2025-02-03T09:59:00+01:00")).ok).toBe(false);
    expect(comprobarAntesDeGenerar(regs[2]!, regs[0]!, AHORA).ok).toBe(false);
  });
});
