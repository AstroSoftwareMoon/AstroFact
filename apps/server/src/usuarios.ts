/** Usuarios, roles y sesiones (modo servidor). Contraseñas con argon2id; 2FA TOTP opcional. */
import { hash, verify } from "@node-rs/argon2";
import type { SqlDriver } from "@astrofact/db";
import { cifrarTexto, descifrarTexto, hashToken, nuevoSecretoTotp, nuevoToken, verificarTotp } from "./seguridad";

export type Rol = "propietario" | "contable" | "lectura";
export const NIVEL: Record<Rol, number> = { lectura: 1, contable: 2, propietario: 3 };
export interface Usuario { id: number; email: string; nombre?: string; rol: Rol; activo: boolean; dosFactores: boolean; }

const SESION_HORAS = 12;

export class Usuarios {
  constructor(private db: SqlDriver, private clave: Buffer, private ahora: () => Date = () => new Date()) {
    db.exec(`CREATE TABLE IF NOT EXISTS usuario (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE COLLATE NOCASE, nombre TEXT, hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK (rol IN ('propietario','contable','lectura')), activo INTEGER NOT NULL DEFAULT 1, totp_cifrado TEXT, totp_pendiente TEXT,
      creado_en TEXT NOT NULL, ultimo_acceso TEXT);
    CREATE TABLE IF NOT EXISTS sesion (token_hash TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL REFERENCES usuario(id), creada_en TEXT NOT NULL, expira_en TEXT NOT NULL, ip TEXT);`);
  }
  private map = (r: any): Usuario => ({ id: r.id, email: r.email, nombre: r.nombre ?? undefined, rol: r.rol, activo: r.activo === 1, dosFactores: !!r.totp_cifrado });
  hayUsuarios() { return (this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM usuario")?.n ?? 0) > 0; }
  listar() { return this.db.all("SELECT * FROM usuario ORDER BY id").map(this.map); }
  porId(id: number) { const r = this.db.get("SELECT * FROM usuario WHERE id = ?", [id]); return r ? this.map(r) : undefined; }

  async crear(email: string, password: string, rol: Rol, nombre?: string): Promise<Usuario> {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email no válido");
    if (password.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
    const h = await hash(password);
    const id = this.db.run("INSERT INTO usuario (email, nombre, hash, rol, creado_en) VALUES (?,?,?,?,?)", [email.trim(), nombre ?? null, h, rol, this.ahora().toISOString()]).lastInsertRowid;
    return this.porId(id)!;
  }
  actualizar(id: number, c: { rol?: Rol; activo?: boolean; nombre?: string }) {
    const u = this.porId(id); if (!u) throw new Error("Usuario inexistente");
    const rol = c.rol ?? u.rol, activo = c.activo ?? u.activo;
    if (u.rol === "propietario" && (rol !== "propietario" || !activo)) {
      const n = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM usuario WHERE rol = 'propietario' AND activo = 1 AND id <> ?", [id])?.n ?? 0;
      if (!n) throw new Error("Debe quedar al menos un propietario activo");
    }
    this.db.run("UPDATE usuario SET rol = ?, activo = ?, nombre = ? WHERE id = ?", [rol, activo ? 1 : 0, c.nombre ?? u.nombre ?? null, id]);
    if (!activo) this.db.run("DELETE FROM sesion WHERE usuario_id = ?", [id]);
    return this.porId(id)!;
  }
  async cambiarPassword(id: number, actual: string, nueva: string) {
    const r = this.db.get<any>("SELECT hash FROM usuario WHERE id = ?", [id]);
    if (!r || !(await verify(r.hash, actual))) throw new Error("Contraseña actual incorrecta");
    if (nueva.length < 10) throw new Error("La contraseña debe tener al menos 10 caracteres");
    this.db.run("UPDATE usuario SET hash = ? WHERE id = ?", [await hash(nueva), id]);
    this.db.run("DELETE FROM sesion WHERE usuario_id = ?", [id]);
  }

  /** Inicio de sesión. Respuesta genérica ante credenciales incorrectas (no revela si el email existe). */
  async login(email: string, password: string, codigo: string | undefined, ip?: string): Promise<{ token: string; usuario: Usuario } | { requiere2fa: true }> {
    const r = this.db.get<any>("SELECT * FROM usuario WHERE email = ? COLLATE NOCASE", [email.trim()]);
    const ok = r ? await verify(r.hash, password) : (await hash("relleno-tiempo-constante"), false);
    if (!r || !ok || r.activo !== 1) throw new Error("Credenciales incorrectas");
    if (r.totp_cifrado) {
      if (!codigo) return { requiere2fa: true };
      if (!verificarTotp(descifrarTexto(this.clave, r.totp_cifrado), codigo, this.ahora().getTime())) throw new Error("Código de verificación incorrecto");
    }
    const token = nuevoToken(); const now = this.ahora();
    this.db.run("INSERT INTO sesion (token_hash, usuario_id, creada_en, expira_en, ip) VALUES (?,?,?,?,?)", [hashToken(token), r.id, now.toISOString(), new Date(now.getTime() + SESION_HORAS * 3600_000).toISOString(), ip ?? null]);
    this.db.run("UPDATE usuario SET ultimo_acceso = ? WHERE id = ?", [now.toISOString(), r.id]);
    return { token, usuario: this.map(r) };
  }
  /** Valida el token y renueva la caducidad (sesión deslizante). */
  sesion(token: string | undefined): Usuario | undefined {
    if (!token) return undefined;
    const h = hashToken(token); const now = this.ahora();
    const s = this.db.get<any>("SELECT s.expira_en, u.* FROM sesion s JOIN usuario u ON u.id = s.usuario_id WHERE s.token_hash = ?", [h]);
    if (!s || s.activo !== 1 || s.expira_en < now.toISOString()) { if (s) this.db.run("DELETE FROM sesion WHERE token_hash = ?", [h]); return undefined; }
    this.db.run("UPDATE sesion SET expira_en = ? WHERE token_hash = ?", [new Date(now.getTime() + SESION_HORAS * 3600_000).toISOString(), h]);
    return this.map(s);
  }
  cerrarSesion(token: string) { this.db.run("DELETE FROM sesion WHERE token_hash = ?", [hashToken(token)]); }

  iniciar2fa(id: number, emisor = "AstroFact") {
    const u = this.porId(id)!; const s = nuevoSecretoTotp();
    this.db.run("UPDATE usuario SET totp_pendiente = ? WHERE id = ?", [cifrarTexto(this.clave, s), id]);
    return { secreto: s, uri: `otpauth://totp/${encodeURIComponent(emisor)}:${encodeURIComponent(u.email)}?secret=${s}&issuer=${encodeURIComponent(emisor)}&algorithm=SHA1&digits=6&period=30` };
  }
  confirmar2fa(id: number, codigo: string) {
    const r = this.db.get<any>("SELECT totp_pendiente FROM usuario WHERE id = ?", [id]);
    if (!r?.totp_pendiente) throw new Error("No hay una activación de 2FA en curso");
    if (!verificarTotp(descifrarTexto(this.clave, r.totp_pendiente), codigo, this.ahora().getTime())) throw new Error("Código incorrecto");
    this.db.run("UPDATE usuario SET totp_cifrado = totp_pendiente, totp_pendiente = NULL WHERE id = ?", [id]);
  }
  async desactivar2fa(id: number, password: string) {
    const r = this.db.get<any>("SELECT hash FROM usuario WHERE id = ?", [id]);
    if (!r || !(await verify(r.hash, password))) throw new Error("Contraseña incorrecta");
    this.db.run("UPDATE usuario SET totp_cifrado = NULL, totp_pendiente = NULL WHERE id = ?", [id]);
  }
}
