/** Criptografía del servidor: clave maestra, cifrado AES-256-GCM, tokens y TOTP (RFC 6238). */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { join } from "node:path";

/** Clave maestra: ASTROFACT_SECRET (≥32 caracteres) o fichero /data/secret.key generado en el primer arranque. */
export function claveMaestra(dataDir: string, env = process.env.ASTROFACT_SECRET): Buffer {
  if (env) { if (env.length < 32) throw new Error("ASTROFACT_SECRET debe tener al menos 32 caracteres"); return createHash("sha256").update(env).digest(); }
  const f = join(dataDir, "secret.key");
  if (!existsSync(f)) { writeFileSync(f, randomBytes(32).toString("base64"), { mode: 0o600 }); try { chmodSync(f, 0o600); } catch { /* Windows */ } }
  return Buffer.from(readFileSync(f, "utf8").trim(), "base64");
}

export function cifrarTexto(clave: Buffer, texto: string): string {
  const iv = randomBytes(12); const c = createCipheriv("aes-256-gcm", clave, iv);
  const d = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), d]).toString("base64");
}
export function descifrarTexto(clave: Buffer, b64: string): string {
  const b = Buffer.from(b64, "base64"); const d = createDecipheriv("aes-256-gcm", clave, b.subarray(0, 12));
  d.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
}

export const nuevoToken = () => randomBytes(32).toString("base64url");
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

/* ---------- TOTP (RFC 6238: HMAC-SHA1, 30 s, 6 dígitos) ---------- */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function base32(buf: Buffer): string { let bits = 0, val = 0, out = ""; for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } } if (bits > 0) out += B32[(val << (5 - bits)) & 31]; return out; }
export function deBase32(s: string): Buffer { let bits = 0, val = 0; const out: number[] = []; for (const ch of s.replace(/=+$/, "").toUpperCase()) { const i = B32.indexOf(ch); if (i < 0) continue; val = (val << 5) | i; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } } return Buffer.from(out); }
export function totp(secreto: string, t = Date.now(), paso = 30): string {
  const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / paso)));
  const h = createHmac("sha1", deBase32(secreto)).update(c).digest();
  const o = h[h.length - 1]! & 0xf;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
/** Admite ±1 intervalo de desfase de reloj. */
export function verificarTotp(secreto: string, codigo: string, t = Date.now()): boolean {
  const c = Buffer.from(codigo.replace(/\s/g, ""));
  return [-1, 0, 1].some((d) => { const e = Buffer.from(totp(secreto, t + d * 30_000)); return e.length === c.length && timingSafeEqual(e, c); });
}
export const nuevoSecretoTotp = () => base32(randomBytes(20));
