/**
 * Validación de identificadores fiscales españoles (NIF de persona física, NIE y NIF de
 * persona jurídica) y estructura de NIF-IVA de la UE.
 * Fuentes: Orden EHA/451/2008 (composición del NIF); estructura NIF-IVA según la
 * tabla "Nota (1)" del documento oficial "Validaciones y errores VERI*FACTU" v1.2.2.
 * Nota: valida el FORMATO y el dígito de control; que el NIF esté "identificado"
 * en el censo solo puede comprobarlo la AEAT.
 */
const DNI_LETTERS = "TRWAGMYFPDXBNJZSQVHLCKE";
const CIF_CONTROL_LETTERS = "JABCDEFGHI";

export type NifKind = "DNI" | "NIE" | "CIF" | "KLM";
export interface NifResult { valid: boolean; kind?: NifKind; normalized: string; reason?: string; }

export function normalizeNif(raw: string): string {
  return raw.toUpperCase().replace(/[\s\-.]/g, "");
}

export function validateNif(raw: string): NifResult {
  const n = normalizeNif(raw);
  if (n.length !== 9) return { valid: false, normalized: n, reason: "El NIF debe tener 9 caracteres" };

  // DNI: 8 dígitos + letra
  if (/^\d{8}[A-Z]$/.test(n)) {
    const ok = DNI_LETTERS[Number(n.slice(0, 8)) % 23] === n[8];
    return ok ? { valid: true, kind: "DNI", normalized: n } : { valid: false, kind: "DNI", normalized: n, reason: "Letra de control incorrecta" };
  }
  // NIE: X/Y/Z + 7 dígitos + letra
  if (/^[XYZ]\d{7}[A-Z]$/.test(n)) {
    const num = "XYZ".indexOf(n[0]!) + n.slice(1, 8);
    const ok = DNI_LETTERS[Number(num) % 23] === n[8];
    return ok ? { valid: true, kind: "NIE", normalized: n } : { valid: false, kind: "NIE", normalized: n, reason: "Letra de control incorrecta" };
  }
  // K, L, M: personas físicas sin DNI/NIE (algoritmo de letra como DNI sobre los 7 dígitos)
  if (/^[KLM]\d{7}[A-Z]$/.test(n)) {
    const ok = DNI_LETTERS[Number(n.slice(1, 8)) % 23] === n[8];
    return ok ? { valid: true, kind: "KLM", normalized: n } : { valid: false, kind: "KLM", normalized: n, reason: "Letra de control incorrecta" };
  }
  // Personas jurídicas y entidades: letra + 7 dígitos + control (dígito o letra)
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(n)) {
    const digits = n.slice(1, 8);
    let sumEven = 0, sumOdd = 0;
    for (let i = 0; i < 7; i++) {
      const d = Number(digits[i]);
      if (i % 2 === 1) sumEven += d;
      else { const x = d * 2; sumOdd += Math.floor(x / 10) + (x % 10); }
    }
    const c = (10 - ((sumEven + sumOdd) % 10)) % 10;
    const first = n[0]!;
    const ctrl = n[8]!;
    const letterOnly = "KPQRSNW".includes(first);
    const digitOnly = "ABEH".includes(first);
    const okDigit = ctrl === String(c);
    const okLetter = ctrl === CIF_CONTROL_LETTERS[c];
    const ok = letterOnly ? okLetter : digitOnly ? okDigit : okDigit || okLetter;
    return ok ? { valid: true, kind: "CIF", normalized: n } : { valid: false, kind: "CIF", normalized: n, reason: "Carácter de control incorrecto" };
  }
  return { valid: false, normalized: n, reason: "Formato de NIF no reconocido" };
}

export const isValidNif = (raw: string) => validateNif(raw).valid;

/** Estructura NIF-IVA por Estado miembro (prefijo + número), tabla oficial AEAT. */
const EU_VAT: Record<string, RegExp> = {
  DE: /^\d{9}$/, AT: /^[A-Z0-9]{9}$/, BE: /^\d{10}$/, CY: /^[A-Z0-9]{9}$/, CZ: /^\d{8,10}$/,
  HR: /^\d{11}$/, DK: /^\d{8}$/, SK: /^\d{10}$/, SI: /^\d{8}$/, EE: /^\d{9}$/, FI: /^\d{8}$/,
  FR: /^[A-Z0-9]{11}$/, EL: /^\d{9}$/, XI: /^([A-Z0-9]{5}|[A-Z0-9]{9}|[A-Z0-9]{12})$/,
  GB: /^([A-Z0-9]{5}|[A-Z0-9]{9}|[A-Z0-9]{12})$/, NL: /^[A-Z0-9]{12}$/, HU: /^\d{8}$/,
  IT: /^\d{11}$/, IE: /^[A-Z0-9]{8,9}$/, LV: /^\d{11}$/, LT: /^(\d{9}|\d{12})$/, LU: /^\d{8}$/,
  MT: /^\d{8}$/, PL: /^\d{10}$/, PT: /^\d{9}$/, SE: /^\d{12}$/, BG: /^\d{9,10}$/, RO: /^[1-9]\d{1,9}$/,
};

/** Valida la estructura de un NIF-IVA comunitario (p. ej. "FR12345678901"). ES se valida con validateNif. */
export function validateEuVat(raw: string): boolean {
  const v = raw.toUpperCase().replace(/[\s\-.]/g, "");
  const cc = v.slice(0, 2);
  if (cc === "ES") return isValidNif(v.slice(2));
  const re = EU_VAT[cc];
  return !!re && re.test(v.slice(2));
}
