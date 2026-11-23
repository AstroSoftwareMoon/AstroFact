import { describe, expect, it } from "vitest";
import { isoDateToAeat, toFechaAeat, toIsoWithOffset } from "../src";

describe("Fechas y huso horario", () => {
  it("península invierno (+01:00) y verano (+02:00)", () => {
    expect(toIsoWithOffset(new Date("2024-01-01T18:20:30Z"))).toBe("2024-01-01T19:20:30+01:00");
    expect(toIsoWithOffset(new Date("2024-07-01T18:20:30Z"))).toBe("2024-07-01T20:20:30+02:00");
  });
  it("Canarias (+00:00 / +01:00)", () => {
    expect(toIsoWithOffset(new Date("2024-01-01T18:20:30Z"), "Atlantic/Canary")).toBe("2024-01-01T18:20:30+00:00");
    expect(toIsoWithOffset(new Date("2024-07-01T18:20:30Z"), "Atlantic/Canary")).toBe("2024-07-01T19:20:30+01:00");
  });
  it("fecha DD-MM-AAAA y cambio de día por huso", () => {
    expect(toFechaAeat(new Date("2024-12-31T23:30:00Z"))).toBe("01-01-2025");
    expect(isoDateToAeat("2025-02-03")).toBe("03-02-2025");
  });
});
