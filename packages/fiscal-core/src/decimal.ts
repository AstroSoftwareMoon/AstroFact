/**
 * Aritmética decimal exacta basada en BigInt (sin coma flotante).
 * Redondeo por defecto: "half-up" simétrico (0,005 → 0,01; −0,005 → −0,01),
 * que es el redondeo comercial habitual en España.
 * TODO(normativa): el RD 1619/2012 no fija el método de redondeo de la cuota
 * (por línea o por tipo); se ofrece configurable en invoice/calc.ts.
 */
export class Dec {
  private constructor(readonly units: bigint, readonly scale: number) {}

  static of(v: string | number | bigint | Dec): Dec {
    if (v instanceof Dec) return v;
    if (typeof v === "bigint") return new Dec(v, 0);
    if (typeof v === "number") {
      if (!Number.isFinite(v)) throw new RangeError(`Número no finito: ${v}`);
      // Convertimos vía cadena para no arrastrar errores binarios (0.1 + 0.2)
      return Dec.of(numberToPlain(v));
    }
    const s = v.trim().replace(",", ".");
    const m = /^([+-])?(\d*)(?:\.(\d*))?$/.exec(s);
    if (!m || (m[2] === "" && (m[3] ?? "") === "")) throw new RangeError(`Decimal no válido: "${v}"`);
    const frac = m[3] ?? "";
    const units = BigInt((m[2] || "0") + frac) * (m[1] === "-" ? -1n : 1n);
    return new Dec(units, frac.length);
  }

  static zero = new Dec(0n, 0);

  private align(o: Dec): [bigint, bigint, number] {
    const s = Math.max(this.scale, o.scale);
    return [this.units * 10n ** BigInt(s - this.scale), o.units * 10n ** BigInt(s - o.scale), s];
  }
  add(o: Dec | string | number): Dec { const [a, b, s] = this.align(Dec.of(o)); return new Dec(a + b, s); }
  sub(o: Dec | string | number): Dec { const [a, b, s] = this.align(Dec.of(o)); return new Dec(a - b, s); }
  mul(o: Dec | string | number): Dec { const d = Dec.of(o); return new Dec(this.units * d.units, this.scale + d.scale); }
  /** División con `scale` decimales de resultado y redondeo half-up. */
  div(o: Dec | string | number, scale = 10): Dec {
    const d = Dec.of(o);
    if (d.units === 0n) throw new RangeError("División por cero");
    // this/d = (u1/10^s1)/(u2/10^s2) ; resultado con scale+1 para redondear
    const num = this.units * 10n ** BigInt(scale + 1 + d.scale);
    const den = d.units * 10n ** BigInt(this.scale);
    return new Dec(num / den, scale + 1).round(scale);
  }
  neg(): Dec { return new Dec(-this.units, this.scale); }
  abs(): Dec { return this.units < 0n ? this.neg() : this; }
  sign(): -1 | 0 | 1 { return this.units === 0n ? 0 : this.units < 0n ? -1 : 1; }
  isZero(): boolean { return this.units === 0n; }
  cmp(o: Dec | string | number): -1 | 0 | 1 { const [a, b] = this.align(Dec.of(o)); return a === b ? 0 : a < b ? -1 : 1; }
  eq(o: Dec | string | number): boolean { return this.cmp(o) === 0; }

  /** Redondeo half-up simétrico a `scale` decimales. */
  round(scale = 2): Dec {
    if (this.scale <= scale) return new Dec(this.units * 10n ** BigInt(scale - this.scale), scale);
    const f = 10n ** BigInt(this.scale - scale);
    const abs = this.units < 0n ? -this.units : this.units;
    let q = abs / f;
    if ((abs % f) * 2n >= f) q += 1n;
    return new Dec(this.units < 0n ? -q : q, scale);
  }

  /** Representación con exactamente `scale` decimales (redondeando). */
  toFixed(scale = 2): string {
    const r = this.round(scale);
    const neg = r.units < 0n;
    const digits = (neg ? -r.units : r.units).toString().padStart(scale + 1, "0");
    const int = scale === 0 ? digits : digits.slice(0, -scale);
    const frac = scale === 0 ? "" : "." + digits.slice(-scale);
    return (neg ? "-" : "") + int + frac;
  }

  /** Representación mínima sin ceros a la derecha (p. ej. "21", "5.2", "0.5"). */
  toPlain(): string {
    let s = this.toFixed(this.scale);
    if (s.includes(".")) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s === "-0" ? "0" : s;
  }

  toNumber(): number { return Number(this.toFixed(this.scale)); }
  toString(): string { return this.toPlain(); }
}

function numberToPlain(n: number): string {
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toFixed(20).replace(/0+$/, "").replace(/\.$/, "");
}

export const D = (v: string | number | bigint | Dec) => Dec.of(v);

/** Suma de una lista de decimales. */
export const sum = (xs: Iterable<Dec>): Dec => { let acc = Dec.zero; for (const x of xs) acc = acc.add(x); return acc; };

/** Formato XML de importes AEAT (ImporteSgn12.2Type): siempre 2 decimales, signo "-" si negativo. */
export function fmtImporte(d: Dec | string | number): string {
  const s = Dec.of(d).toFixed(2);
  if (!/^-?\d{1,12}\.\d{2}$/.test(s)) throw new RangeError(`Importe fuera de rango (12 enteros máx.): ${s}`);
  return s;
}

/** Formato XML de tipos (Tipo2.2Type): mínimo, sin ceros superfluos. */
export function fmtTipo(d: Dec | string | number): string {
  const s = Dec.of(d).round(2).toPlain();
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new RangeError(`Tipo impositivo no válido: ${s}`);
  return s;
}
