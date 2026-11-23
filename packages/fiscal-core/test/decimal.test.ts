import { describe, expect, it } from "vitest";
import { D, Dec, fmtImporte, fmtTipo } from "../src";

describe("Decimal exacto", () => {
  it("sin errores de coma flotante", () => { expect(D("0.1").add("0.2").toPlain()).toBe("0.3"); expect(D(0.1).add(0.2).eq("0.3")).toBe(true); });
  it("redondeo half-up simétrico", () => {
    expect(D("2.345").round(2).toFixed(2)).toBe("2.35");
    expect(D("2.344").round(2).toFixed(2)).toBe("2.34");
    expect(D("-2.345").round(2).toFixed(2)).toBe("-2.35");
    expect(D("0.005").toFixed(2)).toBe("0.01");
    expect(D("1.005").toFixed(2)).toBe("1.01"); // en float sería 1.00
  });
  it("multiplicación y división", () => {
    expect(D("19.99").mul("3").toFixed(2)).toBe("59.97");
    expect(D("100").mul("21").div(100).toFixed(2)).toBe("21.00");
    expect(D("10").div(3, 4).toPlain()).toBe("3.3333");
    expect(() => D(1).div(0)).toThrow();
  });
  it("acepta coma decimal y rechaza basura", () => { expect(D("12,5").toPlain()).toBe("12.5"); expect(() => D("abc")).toThrow(); expect(() => D("")).toThrow(); });
  it("formatos AEAT", () => {
    expect(fmtImporte("131.4")).toBe("131.40");
    expect(fmtImporte("-5")).toBe("-5.00");
    expect(fmtTipo("21.00")).toBe("21");
    expect(fmtTipo("5.20")).toBe("5.2");
    expect(() => fmtImporte("1234567890123")).toThrow();
  });
  it("comparaciones", () => { expect(D("1.50").cmp("1.5")).toBe(0); expect(D("-1").sign()).toBe(-1); expect(Dec.zero.isZero()).toBe(true); });
});
