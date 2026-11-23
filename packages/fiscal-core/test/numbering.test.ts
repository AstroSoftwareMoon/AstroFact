import { describe, expect, it } from "vitest";
import { auditarSerie, formatearNumero, siguienteNumero, validarNumSerie, type Serie } from "../src";

const A: Serie = { codigo: "A", plantilla: "{serie}-{año}-{num:4}", reinicioAnual: true };

describe("Numeración por series", () => {
  it("formatea con plantilla", () => { expect(formatearNumero(A, 7, "2025-03-01")).toBe("A-2025-0007"); });
  it("correlativa y reinicio anual", () => {
    let st = { ultimoNumero: 0 } as any;
    const n1 = siguienteNumero(A, st, "2025-12-30"); st = n1.estado;
    const n2 = siguienteNumero(A, st, "2025-12-31"); st = n2.estado;
    const n3 = siguienteNumero(A, st, "2026-01-02");
    expect([n1.numSerie, n2.numSerie, n3.numSerie]).toEqual(["A-2025-0001", "A-2025-0002", "A-2026-0001"]);
  });
  it("sin reinicio anual sigue contando", () => {
    const s: Serie = { codigo: "B", plantilla: "{serie}{num}", reinicioAnual: false };
    expect(siguienteNumero(s, { ultimoNumero: 41, anio: 2025, ultimaFecha: "2025-12-31" }, "2026-01-01").numSerie).toBe("B42");
  });
  it("rechaza fecha anterior a la última de la serie", () => {
    expect(() => siguienteNumero(A, { ultimoNumero: 3, ultimaFecha: "2025-05-10", anio: 2025 }, "2025-05-09")).toThrow(/anterior/);
  });
  it("caracteres prohibidos por la AEAT", () => {
    expect(validarNumSerie("A-1")).toBeNull();
    for (const bad of ['A"1', "A'1", "A<1", "A>1", "A=1", "Ñ1", "", " A1", "x".repeat(61)]) expect(validarNumSerie(bad)).not.toBeNull();
    expect(() => formatearNumero({ codigo: "A=", plantilla: "{serie}{num}", reinicioAnual: false }, 1, "2025-01-01")).toThrow();
  });
  it("auditoría: saltos, duplicados y fechas incoherentes", () => {
    const p = auditarSerie([{ numero: 1, fecha: "2025-01-01" }, { numero: 2, fecha: "2025-01-05" }, { numero: 2, fecha: "2025-01-05" }, { numero: 5, fecha: "2025-01-03" }]);
    expect(p.map((x) => x.tipo).sort()).toEqual(["duplicado", "fecha-incoherente", "salto"]);
    expect(auditarSerie([{ numero: 1, fecha: "2025-01-01" }, { numero: 2, fecha: "2025-01-01" }])).toEqual([]);
  });
});
