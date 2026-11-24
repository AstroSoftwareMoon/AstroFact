/**
 * Servicio de datos de AstroFact. Orquesta fiscal-core sobre SQLite garantizando:
 *  - emisión atómica (número + factura + registro encadenado + firma) sin saltos ni duplicados;
 *  - inmutabilidad (triggers) y cadena única por obligado (índice único sobre huella_anterior);
 *  - registro de eventos (art. 9 Orden) con resumen periódico y alarmas persistentes (art. 6.f).
 */
import {
  cabezaDe, cabezaEventoDe, calcularTotales, cargarPkcs12, comprobarAntesDeGenerar, construirEvento, construirRegistroAlta,
  construirRegistroAnulacion, datosResumen, exportarRegistros, firmarRegistroXml, generarPkcs12Prueba, isoDateToAeat,
  isValidNif, parseIsoWithOffset, registroAltaXml, registroAnulacionXml, registroEventoXml, resumenPendiente, siguienteNumero,
  TIMEZONES, toFechaAeat, toIsoWithOffset, urlQr, validarFactura, verificarCadena, verificarCadenaEventos, verificarFirmaXml,
  aeatDateToIso, normalizeNif, D, fmtImporte,
  type Credencial, type DatosPropiosEvento, type FacturaBorrador, type Incidencia, type RegistroEvento, type RegistroFacturacion,
  type SistemaInformatico, type TipoEvento, type TipoFactura,
} from "@astrofact/fiscal-core";
import { Mutex, tx, type SqlDriver } from "./driver";
import { migrar } from "./schema";
import { cifrar, descifrar, kdfFromJson, kdfToJson } from "./secure";
import {
  totalesAJson, PLANTILLA_GUARDADA_DEFECTO, type PlantillaGuardada, type Alarma, type CertificadoInfo, type Direccion, type EventoRow, type Factura, type Obligado, type Producto,
  type RegistroRow, type Serie, type Tercero,
} from "./types";

export class ErrorValidacion extends Error {
  constructor(readonly incidencias: Incidencia[]) { super(incidencias.filter((i) => i.nivel === "error").map((i) => i.mensaje).join(" · ")); }
}

export interface ProductorSif {
  NombreRazon: string; NIF: string; NombreSistemaInformatico: string; IdSistemaInformatico: string; Version: string;
  TipoUsoPosibleSoloVerifactu: "S" | "N"; TipoUsoPosibleMultiOT: "S" | "N";
}

export const PRODUCTOR_POR_DEFECTO: ProductorSif = {
  // TODO(normativa #9): datos del productor pendientes de facilitar por el responsable del proyecto.
  NombreRazon: "ASTROFACT (PRODUCTOR PENDIENTE)", NIF: "89890001K", NombreSistemaInformatico: "AstroFact",
  IdSistemaInformatico: "AF", Version: "0.2.0", TipoUsoPosibleSoloVerifactu: "N", TipoUsoPosibleMultiOT: "S",
};

export interface Opciones { productor?: ProductorSif; ahora?: () => Date; onCambio?: () => void; }

/** Borrador de factura tal como lo construye la UI (sin número ni emisor). */
export type BorradorUI = Omit<FacturaBorrador, "numSerie" | "emisor" | "fechaExpedicion"> & { fechaExpedicion?: string; terceroId?: number; vencimiento?: string; };

const j = (v: unknown) => (v === undefined || v === null ? null : JSON.stringify(v));
const pj = <T>(s: unknown): T | undefined => (typeof s === "string" && s ? (JSON.parse(s) as T) : undefined);
const bool = (v: unknown) => v === 1 || v === true || v === "1";

export class AstroFactStore {
  readonly productor: ProductorSif;
  private ahora: () => Date;
  private mutex = new Mutex();
  private credenciales = new Map<number, Credencial>();
  private inicioSesion: Date;
  private onCambio?: () => void;

  constructor(readonly db: SqlDriver, o: Opciones = {}) {
    this.productor = o.productor ?? PRODUCTOR_POR_DEFECTO;
    this.ahora = o.ahora ?? (() => new Date());
    this.inicioSesion = this.ahora();
    this.onCambio = o.onCambio;
    migrar(db, this.ahora);
    if (!this.meta("numero_instalacion")) this.setMeta("numero_instalacion", `AF-${crypto.randomUUID()}`);
  }

  private cambiado() { this.onCambio?.(); }
  private nowIso() { return this.ahora().toISOString(); }
  meta(clave: string): string | undefined { return this.db.get<{ valor: string }>("SELECT valor FROM meta WHERE clave = ?", [clave])?.valor; }
  setMeta(clave: string, valor: string) { this.db.run("INSERT INTO meta (clave, valor) VALUES (?, ?) ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor", [clave, valor]); this.cambiado(); }
  auditar(accion: string, detalle?: unknown) { this.db.run("INSERT INTO auditoria (ts, accion, detalle_json) VALUES (?, ?, ?)", [this.nowIso(), accion, j(detalle)]); }

  sistemaInformatico(): SistemaInformatico {
    const n = this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM obligado")?.n ?? 0;
    const p = this.productor;
    return { NombreRazon: p.NombreRazon, NIF: p.NIF, NombreSistemaInformatico: p.NombreSistemaInformatico, IdSistemaInformatico: p.IdSistemaInformatico,
      Version: p.Version, NumeroInstalacion: this.meta("numero_instalacion")!, TipoUsoPosibleSoloVerifactu: p.TipoUsoPosibleSoloVerifactu,
      TipoUsoPosibleMultiOT: p.TipoUsoPosibleMultiOT, IndicadorMultiplesOT: n > 1 ? "S" : "N" };
  }

  /* ------------------------------ Obligado ------------------------------ */
  private mapObligado = (r: any): Obligado => ({ id: r.id, nif: r.nif, nombre: r.nombre, direccion: pj<Direccion>(r.direccion_json), email: r.email ?? undefined,
    telefono: r.telefono ?? undefined, iban: r.iban ?? undefined, territorio: r.territorio, modo: r.modo, entorno: r.entorno, pieLegal: r.pie_legal ?? undefined, creadoEn: r.creado_en });
  obligados(): Obligado[] { return this.db.all("SELECT * FROM obligado ORDER BY id").map(this.mapObligado); }
  obligado(id?: number): Obligado | undefined {
    const r = id ? this.db.get("SELECT * FROM obligado WHERE id = ?", [id]) : this.db.get("SELECT * FROM obligado ORDER BY id LIMIT 1");
    return r ? this.mapObligado(r) : undefined;
  }
  crearObligado(o: Omit<Obligado, "id" | "creadoEn">): Obligado {
    const nif = normalizeNif(o.nif);
    if (!isValidNif(nif)) throw new Error("El NIF del negocio no es válido");
    if (!o.nombre.trim()) throw new Error("El nombre o razón social es obligatorio");
    if (o.modo === "verifactu") throw new Error("El modo VERI*FACTU estará disponible en la fase 5 (solo entorno de pruebas)");
    const id = this.db.run(`INSERT INTO obligado (nif, nombre, direccion_json, email, telefono, iban, territorio, modo, entorno, pie_legal, creado_en)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [nif, o.nombre.trim(), j(o.direccion), o.email ?? null, o.telefono ?? null, o.iban ?? null, o.territorio, o.modo, o.entorno, o.pieLegal ?? null, this.nowIso()]).lastInsertRowid;
    this.auditar("obligado.crear", { id, nif });
    this.cambiado();
    return this.obligado(id)!;
  }
  /** Datos no fiscales editables (el NIF y el modo no se cambian aquí). */
  actualizarObligado(id: number, c: Partial<Pick<Obligado, "nombre" | "direccion" | "email" | "telefono" | "iban" | "pieLegal" | "territorio">>) {
    const o = this.obligado(id); if (!o) throw new Error("Obligado inexistente");
    const n = { ...o, ...c };
    this.db.run("UPDATE obligado SET nombre=?, direccion_json=?, email=?, telefono=?, iban=?, pie_legal=?, territorio=? WHERE id=?",
      [n.nombre, j(n.direccion), n.email ?? null, n.telefono ?? null, n.iban ?? null, n.pieLegal ?? null, n.territorio, id]);
    this.auditar("obligado.actualizar", { id, campos: Object.keys(c) });
    this.cambiado();
  }
  private tz(o: Obligado) { return TIMEZONES[o.territorio]; }
  hoy(obligadoId: number): string { const o = this.obligado(obligadoId)!; return aeatDateToIso(toFechaAeat(this.ahora(), this.tz(o))); }

  /* ------------------------------ Plantilla de factura ------------------------------ */
  plantilla(obligadoId: number): PlantillaGuardada {
    const o = this.obligado(obligadoId);
    const g = pj<PlantillaGuardada>(this.meta(`plantilla:${obligadoId}`));
    return { ...PLANTILLA_GUARDADA_DEFECTO, pieLegal: o?.pieLegal, ...g };
  }
  guardarPlantilla(obligadoId: number, p: PlantillaGuardada) {
    if (!/^#[0-9a-fA-F]{6}$/.test(p.colorAcento)) throw new Error("Color no válido");
    if (p.logoB64 && p.logoB64.length > 700_000) throw new Error("El logo es demasiado grande (máx. 500 KB)");
    this.setMeta(`plantilla:${obligadoId}`, JSON.stringify(p));
    this.auditar("plantilla.guardar", { obligadoId, estilo: p.estilo });
  }

  /* ------------------------------ Certificado ------------------------------ */
  async guardarCertificado(obligadoId: number, p12: Uint8Array, password: string, dePruebas = false): Promise<CertificadoInfo> {
    const cred = await cargarPkcs12(p12, password); // valida contraseña y contenido
    const o = this.obligado(obligadoId)!;
    if (dePruebas && o.entorno !== "pruebas") throw new Error("Los certificados de pruebas solo se admiten en el entorno de pruebas");
    const { datos, kdf } = await cifrar(p12, password);
    const id = tx(this.db, () => {
      this.db.run("UPDATE certificado SET activo = 0 WHERE obligado_id = ?", [obligadoId]);
      return this.db.run(`INSERT INTO certificado (obligado_id, titular, nif, valido_desde, valido_hasta, de_pruebas, p12_cifrado, kdf_json, creado_en)
        VALUES (?,?,?,?,?,?,?,?,?)`, [obligadoId, cred.titular.cn ?? null, cred.titular.nif ?? null, cred.validoDesde.toISOString(), cred.validoHasta.toISOString(),
        dePruebas ? 1 : 0, datos, kdfToJson(kdf), this.nowIso()]).lastInsertRowid;
    });
    this.credenciales.set(obligadoId, cred);
    this.auditar("certificado.guardar", { id, titular: cred.titular.cn, dePruebas });
    this.cambiado();
    await this.firmarPendientes(obligadoId);
    return this.certificado(obligadoId)!;
  }
  /** Genera y guarda un certificado autofirmado SOLO para el entorno de pruebas. */
  async generarCertificadoPruebas(obligadoId: number, password: string) {
    const o = this.obligado(obligadoId)!;
    const p12 = generarPkcs12Prueba({ nif: o.nif, nombre: o.nombre.slice(0, 40), password, bits: 2048, ahora: this.ahora() });
    return this.guardarCertificado(obligadoId, p12, password, true);
  }
  certificado(obligadoId: number): CertificadoInfo | undefined {
    const r = this.db.get<any>("SELECT * FROM certificado WHERE obligado_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1", [obligadoId]);
    return r ? { id: r.id, titular: r.titular ?? undefined, nif: r.nif ?? undefined, validoDesde: r.valido_desde, validoHasta: r.valido_hasta, dePruebas: bool(r.de_pruebas) } : undefined;
  }
  async desbloquearCertificado(obligadoId: number, password: string) {
    const r = this.db.get<any>("SELECT * FROM certificado WHERE obligado_id = ? AND activo = 1 ORDER BY id DESC LIMIT 1", [obligadoId]);
    if (!r) throw new Error("No hay certificado configurado");
    const p12 = await descifrar(new Uint8Array(r.p12_cifrado), password, kdfFromJson(r.kdf_json));
    this.credenciales.set(obligadoId, await cargarPkcs12(p12, password));
    await this.firmarPendientes(obligadoId);
  }
  certificadoDesbloqueado(obligadoId: number) { return this.credenciales.has(obligadoId); }
  bloquearCertificados() { this.credenciales.clear(); }

  /* ------------------------------ Series ------------------------------ */
  private mapSerie = (r: any): Serie => ({ id: r.id, obligadoId: r.obligado_id, codigo: r.codigo, plantilla: r.plantilla, clase: r.clase, reinicioAnual: bool(r.reinicio_anual),
    ultimoNumero: r.ultimo_numero, ultimaFecha: r.ultima_fecha ?? undefined, anio: r.anio ?? undefined, activa: bool(r.activa) });
  series(obligadoId: number): Serie[] { return this.db.all("SELECT * FROM serie WHERE obligado_id = ? ORDER BY clase, codigo", [obligadoId]).map(this.mapSerie); }
  serie(id: number): Serie | undefined { const r = this.db.get("SELECT * FROM serie WHERE id = ?", [id]); return r ? this.mapSerie(r) : undefined; }
  crearSerie(obligadoId: number, s: Pick<Serie, "codigo" | "plantilla" | "clase" | "reinicioAnual">): Serie {
    if (!/^[A-Za-z0-9\-/_.]{1,10}$/.test(s.codigo)) throw new Error("Código de serie: 1–10 caracteres (letras, números, - / _ .)");
    if (!/\{num(:\d+)?\}/.test(s.plantilla)) throw new Error("La plantilla debe incluir {num}");
    const id = this.db.run("INSERT INTO serie (obligado_id, codigo, plantilla, clase, reinicio_anual) VALUES (?,?,?,?,?)",
      [obligadoId, s.codigo, s.plantilla, s.clase, s.reinicioAnual ? 1 : 0]).lastInsertRowid;
    this.auditar("serie.crear", { id, codigo: s.codigo });
    this.cambiado();
    return this.serie(id)!;
  }

  /* ------------------------------ Terceros y productos ------------------------------ */
  private mapTercero = (r: any): Tercero => ({ id: r.id, obligadoId: r.obligado_id, tipo: r.tipo, nombre: r.nombre, nif: r.nif ?? undefined, idOtro: pj(r.id_otro_json),
    direccion: pj(r.direccion_json), email: r.email ?? undefined, telefono: r.telefono ?? undefined, formaPago: r.forma_pago ?? undefined,
    recargoEquivalencia: bool(r.recargo_equivalencia), retencionPct: r.retencion_pct ?? undefined, notas: r.notas ?? undefined,
    anonimizadoEn: r.anonimizado_en ?? undefined, creadoEn: r.creado_en, actualizadoEn: r.actualizado_en });
  terceros(obligadoId: number, buscar = ""): Tercero[] {
    const q = `%${buscar.trim()}%`;
    return this.db.all("SELECT * FROM tercero WHERE obligado_id = ? AND (nombre LIKE ? OR IFNULL(nif,'') LIKE ?) ORDER BY nombre COLLATE NOCASE", [obligadoId, q, q]).map(this.mapTercero);
  }
  tercero(id: number) { const r = this.db.get("SELECT * FROM tercero WHERE id = ?", [id]); return r ? this.mapTercero(r) : undefined; }
  guardarTercero(obligadoId: number, t: Partial<Tercero> & { nombre: string }): Tercero {
    if (!t.nombre.trim()) throw new Error("El nombre es obligatorio");
    const nif = t.nif ? normalizeNif(t.nif) : undefined;
    if (nif && !isValidNif(nif)) throw new Error(`NIF no válido: ${t.nif}`);
    const now = this.nowIso();
    const vals = [t.tipo ?? "cliente", t.nombre.trim(), nif ?? null, j(t.idOtro), j(t.direccion), t.email ?? null, t.telefono ?? null, t.formaPago ?? null,
      t.recargoEquivalencia ? 1 : 0, t.retencionPct ?? null, t.notas ?? null];
    let id = t.id;
    if (id) this.db.run(`UPDATE tercero SET tipo=?, nombre=?, nif=?, id_otro_json=?, direccion_json=?, email=?, telefono=?, forma_pago=?, recargo_equivalencia=?, retencion_pct=?, notas=?, actualizado_en=? WHERE id=? AND obligado_id=?`, [...vals, now, id, obligadoId]);
    else id = this.db.run(`INSERT INTO tercero (tipo, nombre, nif, id_otro_json, direccion_json, email, telefono, forma_pago, recargo_equivalencia, retencion_pct, notas, creado_en, actualizado_en, obligado_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...vals, now, now, obligadoId]).lastInsertRowid;
    this.cambiado();
    return this.tercero(id)!;
  }
  /**
   * RGPD: "derecho de supresión" compatible con la obligación de conservar facturas
   * (art. 17.3.b RGPD; art. 19 RD 1619/2012; art. 8 Orden): se anonimizan los datos de contacto
   * no fiscales del maestro; las facturas emitidas y sus registros se conservan intactos.
   */
  anonimizarTercero(id: number) {
    this.db.run("UPDATE tercero SET email=NULL, telefono=NULL, notas=NULL, forma_pago=NULL, anonimizado_en=? WHERE id=?", [this.nowIso(), id]);
    this.auditar("tercero.anonimizar", { id });
    this.cambiado();
  }
  /** RGPD: exportación de los datos de un cliente (maestro + facturas). */
  exportarDatosTercero(id: number) {
    const t = this.tercero(id);
    return { tercero: t, facturas: this.db.all<any>("SELECT num_serie, fecha_expedicion, importe_total FROM factura WHERE tercero_id = ?", [id]) };
  }
  private mapProducto = (r: any): Producto => ({ id: r.id, obligadoId: r.obligado_id, codigo: r.codigo ?? undefined, nombre: r.nombre, descripcion: r.descripcion ?? undefined,
    precio: r.precio, unidad: r.unidad ?? undefined, impuesto: r.impuesto, tipo: r.tipo ?? undefined, calificacion: r.calificacion ?? undefined, exenta: r.exenta ?? undefined,
    sujetaRetencion: bool(r.sujeta_retencion), activo: bool(r.activo), creadoEn: r.creado_en });
  productos(obligadoId: number, buscar = ""): Producto[] {
    const q = `%${buscar.trim()}%`;
    return this.db.all("SELECT * FROM producto WHERE obligado_id = ? AND activo = 1 AND (nombre LIKE ? OR IFNULL(codigo,'') LIKE ?) ORDER BY nombre COLLATE NOCASE", [obligadoId, q, q]).map(this.mapProducto);
  }
  producto(id: number) { const r = this.db.get("SELECT * FROM producto WHERE id = ?", [id]); return r ? this.mapProducto(r) : undefined; }
  guardarProducto(obligadoId: number, p: Partial<Producto> & { nombre: string; precio: string }): Producto {
    if (!p.nombre.trim()) throw new Error("El nombre es obligatorio");
    const precio = D(p.precio).toPlain();
    const vals = [p.codigo ?? null, p.nombre.trim(), p.descripcion ?? null, precio, p.unidad ?? null, p.impuesto ?? "01", p.tipo ?? null, p.calificacion ?? null, p.exenta ?? null, p.sujetaRetencion === false ? 0 : 1];
    let id = p.id;
    if (id) this.db.run("UPDATE producto SET codigo=?, nombre=?, descripcion=?, precio=?, unidad=?, impuesto=?, tipo=?, calificacion=?, exenta=?, sujeta_retencion=? WHERE id=? AND obligado_id=?", [...vals, id, obligadoId]);
    else id = this.db.run("INSERT INTO producto (codigo, nombre, descripcion, precio, unidad, impuesto, tipo, calificacion, exenta, sujeta_retencion, obligado_id, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", [...vals, obligadoId, this.nowIso()]).lastInsertRowid;
    this.cambiado();
    return this.producto(id)!;
  }
  archivarProducto(id: number) { this.db.run("UPDATE producto SET activo = 0 WHERE id = ?", [id]); this.cambiado(); }

  /* ------------------------------ Facturas ------------------------------ */
  private mapFactura = (r: any): Factura => ({ id: r.id, obligadoId: r.obligado_id, serieId: r.serie_id, numero: r.numero, numSerie: r.num_serie,
    fechaExpedicion: r.fecha_expedicion, fechaOperacion: r.fecha_operacion ?? undefined, tipoFactura: r.tipo_factura, tipoRectificativa: r.tipo_rectificativa ?? undefined,
    terceroId: r.tercero_id ?? undefined, datos: JSON.parse(r.datos_json), totales: JSON.parse(r.totales_json), qrUrl: r.qr_url, dePruebas: bool(r.de_pruebas),
    estadoCobro: r.estado_cobro, vencimiento: r.vencimiento ?? undefined, anulada: bool(r.anulada), rectificadaPor: r.rectificada_por ?? undefined, emitidaEn: r.emitida_en });
  facturas(obligadoId: number, f: { buscar?: string; desde?: string; hasta?: string; limite?: number } = {}): Factura[] {
    const q = `%${(f.buscar ?? "").trim()}%`;
    return this.db.all(`SELECT * FROM factura WHERE obligado_id = ? AND (num_serie LIKE ? OR datos_json LIKE ?)
      AND fecha_expedicion >= ? AND fecha_expedicion <= ? ORDER BY fecha_expedicion DESC, id DESC LIMIT ?`,
      [obligadoId, q, q, f.desde ?? "0000-00-00", f.hasta ?? "9999-12-31", f.limite ?? 500]).map(this.mapFactura);
  }
  factura(id: number) { const r = this.db.get("SELECT * FROM factura WHERE id = ?", [id]); return r ? this.mapFactura(r) : undefined; }
  marcarCobro(id: number, estado: Factura["estadoCobro"]) { this.db.run("UPDATE factura SET estado_cobro = ? WHERE id = ?", [estado, id]); this.auditar("factura.cobro", { id, estado }); this.cambiado(); }

  /** Construye el borrador fiscal completo a partir del borrador de la UI. */
  componerBorrador(obligadoId: number, b: BorradorUI, numSerie = "PENDIENTE"): FacturaBorrador {
    const o = this.obligado(obligadoId)!;
    const t = b.terceroId ? this.tercero(b.terceroId) : undefined;
    const destinatarios = b.destinatarios ?? (t ? [{ nombre: t.nombre, nif: t.nif, idOtro: t.idOtro, direccion: t.direccion }] : []);
    return { ...b, numSerie, fechaExpedicion: b.fechaExpedicion ?? this.hoy(obligadoId), emisor: { nombre: o.nombre, nif: o.nif, direccion: o.direccion }, destinatarios };
  }
  /** Validación previa (para mostrar avisos en la UI sin emitir). */
  validar(obligadoId: number, b: BorradorUI): Incidencia[] { return validarFactura(this.componerBorrador(obligadoId, b, "A-1"), this.hoy(obligadoId)); }

  private ultimoRegistro(obligadoId: number) {
    const rows = this.db.all<any>("SELECT registro_json, tipo FROM registro_facturacion WHERE obligado_id = ? ORDER BY id DESC LIMIT 2", [obligadoId]);
    const toReg = (r: any): RegistroFacturacion => ({ tipo: r.tipo, registro: JSON.parse(r.registro_json) });
    return { ultimo: rows[0] ? toReg(rows[0]) : null, penultimo: rows[1] ? toReg(rows[1]) : null };
  }
  /** Fecha-hora de generación monótona (nunca anterior al último registro, art. 7). */
  private fechaHoraGen(obligadoId: number, ultimaIso?: string): string {
    const o = this.obligado(obligadoId)!;
    let now = this.ahora();
    if (ultimaIso) { const u = parseIsoWithOffset(ultimaIso); if (u > now) now = u; }
    return toIsoWithOffset(now, this.tz(o));
  }
  private exigirCredencial(o: Obligado): Credencial | undefined {
    if (o.modo === "verifactu") return undefined;
    const c = this.credenciales.get(o.id);
    if (!c) throw new Error("Para emitir en modo No VERI*FACTU hay que firmar los registros: desbloquea tu certificado electrónico.");
    return c;
  }

  /** Emisión atómica de una factura (completa, simplificada o rectificativa). */
  async emitir(obligadoId: number, serieId: number, b: BorradorUI): Promise<Factura> {
    return this.mutex.run(async () => {
      const o = this.obligado(obligadoId); if (!o) throw new Error("Obligado inexistente");
      const serie = this.serie(serieId); if (!serie || serie.obligadoId !== obligadoId || !serie.activa) throw new Error("Serie no válida");
      const cred = this.exigirCredencial(o);
      const certInfo = this.certificado(obligadoId);
      const fechaExp = b.fechaExpedicion ?? this.hoy(obligadoId);
      const sig = siguienteNumero({ codigo: serie.codigo, plantilla: serie.plantilla, reinicioAnual: serie.reinicioAnual },
        { ultimoNumero: serie.ultimoNumero, ultimaFecha: serie.ultimaFecha, anio: serie.anio }, fechaExp);
      const borrador = this.componerBorrador(obligadoId, { ...b, fechaExpedicion: fechaExp }, sig.numSerie);
      const inc = validarFactura(borrador, this.hoy(obligadoId));
      if (inc.some((i) => i.nivel === "error")) throw new ErrorValidacion(inc);

      const { ultimo, penultimo } = this.ultimoRegistro(obligadoId);
      const pre = comprobarAntesDeGenerar(ultimo, penultimo, this.ahora());
      if (!pre.ok) { this.abrirAlarma(obligadoId, "cadena", pre.motivo!); throw new Error(`No se puede generar el registro: ${pre.motivo}`); }
      const fechaHoraGen = this.fechaHoraGen(obligadoId, ultimo?.registro.FechaHoraHusoGenRegistro);
      const { registro, totales } = construirRegistroAlta({ factura: borrador, sistema: this.sistemaInformatico(), anterior: ultimo ? cabezaDe(ultimo) : null, fechaHoraGen });
      let xml = registroAltaXml(registro);
      if (cred) xml = await firmarRegistroXml(xml, cred, this.ahora());
      const qr = urlQr({ nif: o.nif, numSerie: sig.numSerie, fechaExpedicion: isoDateToAeat(fechaExp), importeTotal: registro.ImporteTotal }, { entorno: o.entorno, verifactu: o.modo === "verifactu" });
      const tj = totalesAJson(totales);

      const facturaId = tx(this.db, () => {
        const upd = this.db.run("UPDATE serie SET ultimo_numero = ?, ultima_fecha = ?, anio = ? WHERE id = ? AND ultimo_numero = ?",
          [sig.estado.ultimoNumero, sig.estado.ultimaFecha ?? null, sig.estado.anio ?? null, serieId, serie.ultimoNumero]);
        if (upd.changes !== 1) throw new Error("La serie ha cambiado durante la emisión; vuelve a intentarlo");
        const fid = this.db.run(`INSERT INTO factura (obligado_id, serie_id, numero, num_serie, fecha_expedicion, fecha_operacion, tipo_factura, tipo_rectificativa, tercero_id,
            datos_json, totales_json, base_total, cuota_total, importe_total, retencion, total_a_pagar, qr_url, de_pruebas, vencimiento, emitida_en)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
          [obligadoId, serieId, sig.numero, sig.numSerie, fechaExp, borrador.fechaOperacion ?? null, borrador.tipoFactura, borrador.rectificacion?.tipo ?? null,
            b.terceroId ?? null, JSON.stringify(borrador), JSON.stringify(tj), tj.baseTotal, tj.cuotaTotal, tj.importeTotal, tj.retencion, tj.totalAPagar, qr,
            o.entorno === "pruebas" || certInfo?.dePruebas ? 1 : 0, b.vencimiento ?? null, this.nowIso()]).lastInsertRowid;
        this.db.run(`INSERT INTO registro_facturacion (obligado_id, factura_id, tipo, num_serie, fecha_expedicion, fecha_hora_gen, huella, huella_anterior, registro_json, xml, firmado)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [obligadoId, fid, "alta", sig.numSerie, fechaExp, fechaHoraGen, registro.Huella,
          ultimo ? ultimo.registro.Huella : null, JSON.stringify(registro), xml, cred ? 1 : 0]);
        // Rectificativa: enlaza la(s) original(es)
        for (const r of borrador.rectificacion?.facturas ?? []) {
          this.db.run("UPDATE factura SET rectificada_por = ? WHERE obligado_id = ? AND num_serie = ? AND rectificada_por IS NULL", [fid, obligadoId, r.NumSerieFactura]);
        }
        this.auditar("factura.emitir", { id: fid, numSerie: sig.numSerie, huella: registro.Huella });
        return fid;
      });
      this.cambiado();
      return this.factura(facturaId)!;
    });
  }

  /** Registro de anulación (factura expedida por error que no debió existir). No borra nada. */
  async anular(facturaId: number, motivo = ""): Promise<void> {
    return this.mutex.run(async () => {
      const f = this.factura(facturaId); if (!f) throw new Error("Factura inexistente");
      if (f.anulada) throw new Error("La factura ya está anulada");
      const o = this.obligado(f.obligadoId)!;
      const cred = this.exigirCredencial(o);
      const { ultimo, penultimo } = this.ultimoRegistro(o.id);
      const pre = comprobarAntesDeGenerar(ultimo, penultimo, this.ahora());
      if (!pre.ok) { this.abrirAlarma(o.id, "cadena", pre.motivo!); throw new Error(`No se puede generar el registro: ${pre.motivo}`); }
      const fechaHoraGen = this.fechaHoraGen(o.id, ultimo?.registro.FechaHoraHusoGenRegistro);
      const reg = construirRegistroAnulacion({ factura: { IDEmisorFactura: o.nif, NumSerieFactura: f.numSerie, FechaExpedicionFactura: isoDateToAeat(f.fechaExpedicion) },
        sistema: this.sistemaInformatico(), anterior: ultimo ? cabezaDe(ultimo) : null, fechaHoraGen });
      let xml = registroAnulacionXml(reg);
      if (cred) xml = await firmarRegistroXml(xml, cred, this.ahora());
      tx(this.db, () => {
        this.db.run(`INSERT INTO registro_facturacion (obligado_id, factura_id, tipo, num_serie, fecha_expedicion, fecha_hora_gen, huella, huella_anterior, registro_json, xml, firmado)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [o.id, f.id, "anulacion", f.numSerie, f.fechaExpedicion, fechaHoraGen, reg.Huella, ultimo?.registro.Huella ?? null, JSON.stringify(reg), xml, cred ? 1 : 0]);
        this.db.run("UPDATE factura SET anulada = 1 WHERE id = ?", [f.id]);
        this.auditar("factura.anular", { id: f.id, motivo });
      });
      this.cambiado();
    });
  }

  /** Prepara el borrador de una rectificativa a partir de una factura emitida. */
  borradorRectificativa(facturaId: number, tipo: "S" | "I", tipoFactura?: TipoFactura): BorradorUI {
    const f = this.factura(facturaId); if (!f) throw new Error("Factura inexistente");
    const simplificada = f.tipoFactura === "F2";
    const orig = { IDEmisorFactura: f.datos.emisor.nif, NumSerieFactura: f.numSerie, FechaExpedicionFactura: isoDateToAeat(f.fechaExpedicion) };
    const lineas = tipo === "S" ? f.datos.lineas.map((l) => ({ ...l })) : f.datos.lineas.map((l) => ({ ...l, cantidad: D(l.cantidad).neg().toPlain() }));
    return {
      tipoFactura: tipoFactura ?? (simplificada ? "R5" : "R1"),
      terceroId: f.terceroId, destinatarios: simplificada ? [] : f.datos.destinatarios,
      descripcionOperacion: `Rectificación de la factura ${f.numSerie}`,
      lineas, retencionPct: f.datos.retencionPct, redondeo: f.datos.redondeo,
      rectificacion: { tipo, facturas: [orig], importeRectificacion: tipo === "S" ? { baseRectificada: f.totales.baseTotal,
        cuotaRectificada: fmtImporte(f.totales.desglose.reduce((a, g) => a.add(g.cuota), D(0))),
        cuotaRecargoRectificado: f.totales.desglose.some((g) => g.recargo) ? fmtImporte(f.totales.desglose.reduce((a, g) => a.add(g.cuotaRecargo), D(0))) : undefined } : undefined },
    };
  }

  /* ------------------------------ Cadena y registros ------------------------------ */
  private mapRegistro = (r: any): RegistroRow => ({ id: r.id, obligadoId: r.obligado_id, facturaId: r.factura_id ?? undefined, tipo: r.tipo, numSerie: r.num_serie,
    fechaExpedicion: r.fecha_expedicion, fechaHoraGen: r.fecha_hora_gen, huella: r.huella, huellaAnterior: r.huella_anterior ?? undefined, xml: r.xml,
    firmado: bool(r.firmado), exportadoEn: r.exportado_en ?? undefined });
  registros(obligadoId: number): RegistroRow[] { return this.db.all("SELECT * FROM registro_facturacion WHERE obligado_id = ? ORDER BY id", [obligadoId]).map(this.mapRegistro); }
  registrosFactura(facturaId: number): RegistroRow[] { return this.db.all("SELECT * FROM registro_facturacion WHERE factura_id = ? ORDER BY id", [facturaId]).map(this.mapRegistro); }
  cadena(obligadoId: number): RegistroFacturacion[] {
    return this.db.all<any>("SELECT tipo, registro_json FROM registro_facturacion WHERE obligado_id = ? ORDER BY id", [obligadoId]).map((r) => ({ tipo: r.tipo, registro: JSON.parse(r.registro_json) }));
  }

  /**
   * Proceso de detección de anomalías (art. 6.b, 6.d, 6.e, 7.h, 9.1.c–f):
   * comprueba huellas, firmas, encadenado y fechas de facturación y de eventos, y además
   * que el XML conservado corresponda al registro (no manipulado fuera de la app).
   */
  async verificarIntegridad(obligadoId: number) {
    const o = this.obligado(obligadoId)!;
    const rows = this.db.all<any>("SELECT * FROM registro_facturacion WHERE obligado_id = ? ORDER BY id", [obligadoId]);
    const regs: RegistroFacturacion[] = rows.map((r) => ({ tipo: r.tipo, registro: JSON.parse(r.registro_json) }));
    const firmas = await Promise.all(rows.map(async (r) => !bool(r.firmado) || (await verificarFirmaXml(r.xml)).valida));
    const fact = await verificarCadena(regs, { ahora: this.ahora(), verificarFirma: (i) => firmas[i]! });
    // Coherencia JSON ↔ XML conservado (huella del XML)
    rows.forEach((r, i) => { const m = /<sum1:Huella>([0-9A-F]{64})<\/sum1:Huella>\s*(?:<ds:Signature|<\/sum1:RegistroAlta>|<\/sum1:RegistroAnulacion>)/.exec(r.xml); if (!m || m[1] !== r.huella) fact.anomalias.push({ indice: i, tipo: "03", mensaje: "El XML conservado no corresponde al registro" }); });
    fact.ok = fact.anomalias.length === 0;
    const evs = this.db.all<any>("SELECT * FROM registro_evento WHERE obligado_id = ? ORDER BY id", [obligadoId]);
    const evCad = verificarCadenaEventos(evs.map((e) => JSON.parse(e.evento_json) as RegistroEvento), this.ahora());
    const firmasEv = await Promise.all(evs.map(async (e) => !bool(e.firmado) || (await verificarFirmaXml(e.xml)).valida));
    firmasEv.forEach((ok, i) => { if (!ok) evCad.anomalias.push({ indice: i, tipo: "02", mensaje: "Firma del evento no válida" }); });
    evCad.ok = evCad.anomalias.length === 0;

    if (o.modo === "no_verifactu") {
      const n = regs.length;
      await this.registrarEvento(obligadoId, "03", { LanzamientoProcesoDeteccionAnomaliasRegFacturacion: {
        RealizadoProcesoSobreIntegridadHuellasRegFacturacion: "S", NumeroDeRegistrosFacturacionProcesadosSobreIntegridadHuellas: n,
        RealizadoProcesoSobreIntegridadFirmasRegFacturacion: "S", NumeroDeRegistrosFacturacionProcesadosSobreIntegridadFirmas: n,
        RealizadoProcesoSobreTrazabilidadCadenaRegFacturacion: "S", NumeroDeRegistrosFacturacionProcesadosSobreTrazabilidadCadena: n,
        RealizadoProcesoSobreTrazabilidadFechasRegFacturacion: "S", NumeroDeRegistrosFacturacionProcesadosSobreTrazabilidadFechas: n } });
      for (const a of fact.anomalias.slice(0, 20)) {
        const r = regs[a.indice];
        const id = r ? (r.tipo === "alta" ? r.registro.IDFactura : { IDEmisorFactura: r.registro.IDFactura.IDEmisorFacturaAnulada, NumSerieFactura: r.registro.IDFactura.NumSerieFacturaAnulada, FechaExpedicionFactura: r.registro.IDFactura.FechaExpedicionFacturaAnulada }) : undefined;
        await this.registrarEvento(obligadoId, "04", { DeteccionAnomaliasRegFacturacion: { TipoAnomalia: a.tipo, OtrosDatosAnomalia: a.mensaje.slice(0, 100), RegistroFacturacionAnomalo: id } });
      }
      await this.registrarEvento(obligadoId, "05", { LanzamientoProcesoDeteccionAnomaliasRegEvento: {
        RealizadoProcesoSobreIntegridadHuellasRegEvento: "S", NumeroDeRegistrosEventoProcesadosSobreIntegridadHuellas: evs.length,
        RealizadoProcesoSobreIntegridadFirmasRegEvento: "S", NumeroDeRegistrosEventoProcesadosSobreIntegridadFirmas: evs.length,
        RealizadoProcesoSobreTrazabilidadCadenaRegEvento: "S", NumeroDeRegistrosEventoProcesadosSobreTrazabilidadCadena: evs.length,
        RealizadoProcesoSobreTrazabilidadFechasRegEvento: "S", NumeroDeRegistrosEventoProcesadosSobreTrazabilidadFechas: evs.length } });
      for (const a of evCad.anomalias.slice(0, 20)) await this.registrarEvento(obligadoId, "06", { DeteccionAnomaliasRegEvento: { TipoAnomalia: a.tipo, OtrosDatosAnomalia: a.mensaje.slice(0, 100) } });
    }
    if (!fact.ok || !evCad.ok) this.abrirAlarma(obligadoId, "integridad", `Se han detectado ${fact.anomalias.length + evCad.anomalias.length} anomalías en la cadena de registros`, { facturacion: fact.anomalias, eventos: evCad.anomalias });
    else this.db.run("UPDATE alarma SET resuelta_en = ? WHERE obligado_id = ? AND resuelta_en IS NULL AND tipo IN ('integridad','cadena')", [this.nowIso(), obligadoId]);
    this.cambiado();
    return { facturacion: fact, eventos: evCad };
  }

  /* ------------------------------ Alarmas (art. 6.f) ------------------------------ */
  abrirAlarma(obligadoId: number | undefined, tipo: string, mensaje: string, detalle?: unknown) {
    const ya = this.db.get("SELECT id FROM alarma WHERE IFNULL(obligado_id,0) = ? AND tipo = ? AND mensaje = ? AND resuelta_en IS NULL", [obligadoId ?? 0, tipo, mensaje]);
    if (!ya) this.db.run("INSERT INTO alarma (obligado_id, tipo, mensaje, detalle_json, creada_en) VALUES (?,?,?,?,?)", [obligadoId ?? null, tipo, mensaje, j(detalle), this.nowIso()]);
    this.cambiado();
  }
  /** Las alarmas solo se cierran cuando una nueva verificación confirma la integridad (art. 6.f.1º). */
  alarmasAbiertas(obligadoId?: number): Alarma[] {
    return this.db.all<any>("SELECT * FROM alarma WHERE resuelta_en IS NULL AND (? IS NULL OR obligado_id = ? OR obligado_id IS NULL) ORDER BY id", [obligadoId ?? null, obligadoId ?? null])
      .map((r) => ({ id: r.id, obligadoId: r.obligado_id ?? undefined, tipo: r.tipo, mensaje: r.mensaje, detalle: pj(r.detalle_json), creadaEn: r.creada_en }));
  }

  /* ------------------------------ Eventos (art. 9) ------------------------------ */
  private mapEvento = (r: any): EventoRow => ({ id: r.id, obligadoId: r.obligado_id, tipo: r.tipo, fechaHoraGen: r.fecha_hora_gen, huella: r.huella, xml: r.xml, firmado: bool(r.firmado) });
  eventos(obligadoId: number, limite = 500): EventoRow[] { return this.db.all("SELECT * FROM registro_evento WHERE obligado_id = ? ORDER BY id DESC LIMIT ?", [obligadoId, limite]).map(this.mapEvento); }

  async registrarEvento(obligadoId: number, tipo: TipoEvento, datos?: DatosPropiosEvento, otros?: string): Promise<EventoRow> {
    const o = this.obligado(obligadoId)!;
    const last = this.db.get<any>("SELECT evento_json FROM registro_evento WHERE obligado_id = ? ORDER BY id DESC LIMIT 1", [obligadoId]);
    const anterior = last ? cabezaEventoDe(JSON.parse(last.evento_json)) : null;
    const ev = construirEvento({ sistema: this.sistemaInformatico(), obligado: { NombreRazon: o.nombre, NIF: o.nif }, tipo, datos, otrosDatos: otros,
      fechaHoraGen: this.fechaHoraGen(obligadoId, anterior?.FechaHoraHusoGenEvento), anterior });
    const cred = this.credenciales.get(obligadoId);
    let xml = registroEventoXml(ev);
    if (cred) xml = await firmarRegistroXml(xml, cred, this.ahora());
    const id = this.db.run("INSERT INTO registro_evento (obligado_id, tipo, fecha_hora_gen, huella, huella_anterior, evento_json, xml, firmado) VALUES (?,?,?,?,?,?,?,?)",
      [obligadoId, tipo, ev.Evento.FechaHoraHusoGenEvento, ev.Evento.HuellaEvento, anterior?.HuellaEvento ?? null, JSON.stringify(ev), xml, cred ? 1 : 0]).lastInsertRowid;
    this.cambiado();
    return this.mapEvento(this.db.get("SELECT * FROM registro_evento WHERE id = ?", [id]));
  }
  /** Firma los eventos generados mientras el certificado estaba bloqueado (p. ej. al arrancar). */
  async firmarPendientes(obligadoId: number) {
    const cred = this.credenciales.get(obligadoId); if (!cred) return 0;
    const rows = this.db.all<any>("SELECT id, xml FROM registro_evento WHERE obligado_id = ? AND firmado = 0", [obligadoId]);
    for (const r of rows) this.db.run("UPDATE registro_evento SET xml = ?, firmado = 1 WHERE id = ?", [await firmarRegistroXml(r.xml, cred, this.ahora()), r.id]);
    if (rows.length) this.cambiado();
    return rows.length;
  }

  /** Al abrir la app: evento de inicio como No VERI*FACTU (la primera vez) y resumen pendiente. */
  async arranque(obligadoId: number) {
    const o = this.obligado(obligadoId)!;
    this.inicioSesion = this.ahora();
    this.auditar("app.arranque", { obligadoId });
    if (o.modo === "no_verifactu" && this.meta(`nvf_inicio:${obligadoId}`) !== "1") {
      await this.registrarEvento(obligadoId, "01");
      this.setMeta(`nvf_inicio:${obligadoId}`, "1");
    }
    await this.tick(obligadoId);
  }
  /** Llamar periódicamente (p. ej. cada minuto): genera el resumen cada 6 horas operativas. */
  async tick(obligadoId: number) {
    const o = this.obligado(obligadoId)!;
    if (o.modo !== "no_verifactu") return false;
    const ult = this.db.get<any>("SELECT fecha_hora_gen FROM registro_evento WHERE obligado_id = ? AND tipo = '10' ORDER BY id DESC LIMIT 1", [obligadoId]);
    if (!resumenPendiente(ult ? parseIsoWithOffset(ult.fecha_hora_gen) : null, this.inicioSesion, this.ahora())) return false;
    await this.resumen(obligadoId);
    return true;
  }
  /** Registro resumen de eventos (art. 9.2), también antes de cerrar la aplicación. */
  async resumen(obligadoId: number) {
    const ultRes = this.db.get<any>("SELECT id, fecha_hora_gen FROM registro_evento WHERE obligado_id = ? AND tipo = '10' ORDER BY id DESC LIMIT 1", [obligadoId]);
    const evs = this.db.all<any>("SELECT evento_json FROM registro_evento WHERE obligado_id = ? AND id > ?", [obligadoId, ultRes?.id ?? 0]).map((e) => JSON.parse(e.evento_json));
    const desdeRf = Number(this.meta(`resumen_rf:${obligadoId}`) ?? 0);
    const rfRows = this.db.all<any>("SELECT id, tipo, registro_json FROM registro_facturacion WHERE obligado_id = ? AND id > ? ORDER BY id", [obligadoId, desdeRf]);
    const regs = rfRows.map((r) => ({ tipo: r.tipo, registro: JSON.parse(r.registro_json) }) as RegistroFacturacion);
    if (rfRows.length) this.setMeta(`resumen_rf:${obligadoId}`, String(rfRows[rfRows.length - 1].id));
    const altas = regs.filter((r) => r.tipo === "alta").map((r) => r.registro as { CuotaTotal: string; ImporteTotal: string });
    const ref = (r?: RegistroFacturacion) => (r ? { ...cabezaDe(r), FechaHoraHusoGenRegistro: undefined } as any : undefined);
    const strip = (x: any) => (x ? { IDEmisorFactura: x.IDEmisorFactura, NumSerieFactura: x.NumSerieFactura, FechaExpedicionFactura: x.FechaExpedicionFactura, Huella: x.Huella } : undefined);
    return this.registrarEvento(obligadoId, "10", datosResumen(evs, altas, regs.length - altas.length, strip(ref(regs[0])), strip(ref(regs[regs.length - 1]))));
  }
  async cierre(obligadoId: number) { await this.resumen(obligadoId); this.auditar("app.cierre", { obligadoId }); }

  /* ------------------------------ Exportación (art. 8.2) ------------------------------ */
  async exportarRegistros(obligadoId: number, desdeIso: string, hastaIso: string) {
    const o = this.obligado(obligadoId)!;
    const rows = this.db.all<any>("SELECT * FROM registro_facturacion WHERE obligado_id = ? AND substr(fecha_hora_gen,1,10) >= ? AND substr(fecha_hora_gen,1,10) <= ? ORDER BY id", [obligadoId, desdeIso, hastaIso]);
    if (!rows.length) throw new Error("No hay registros en ese periodo");
    const regs: RegistroFacturacion[] = rows.map((r) => ({ tipo: r.tipo, registro: JSON.parse(r.registro_json) }));
    const ex = exportarRegistros({ NombreRazon: o.nombre, NIF: o.nif }, regs, `registros-${o.nif}-${desdeIso}_${hastaIso}`);
    const firmados = rows.filter((r) => bool(r.firmado)).map((r) => ({ nombre: `firmados/${String(r.id).padStart(8, "0")}-${r.tipo}-${r.num_serie.replace(/[^A-Za-z0-9_-]/g, "_")}.xml`, contenido: r.xml as string }));
    const fin = rows[rows.length - 1], ini = rows[0];
    if (o.modo === "no_verifactu") {
      await this.registrarEvento(obligadoId, "08", { ExportacionRegFacturacionPeriodo: {
        FechaHoraHusoInicioPeriodoExport: ini.fecha_hora_gen, FechaHoraHusoFinPeriodoExport: fin.fecha_hora_gen,
        RegistroFacturacionInicialPeriodo: { ...ex.resumen.inicial!, FechaHoraHusoGenRegistro: undefined } as any,
        RegistroFacturacionFinalPeriodo: { ...ex.resumen.final!, FechaHoraHusoGenRegistro: undefined } as any,
        NumeroDeRegistrosFacturacionAltaExportados: ex.resumen.numAltas, SumaCuotaTotalAlta: ex.resumen.sumaCuotaTotalAlta, SumaImporteTotalAlta: ex.resumen.sumaImporteTotalAlta,
        NumeroDeRegistrosFacturacionAnulacionExportados: ex.resumen.numAnulaciones, RegistrosFacturacionExportadosDejanDeConservarse: "N" } });
    }
    this.db.run("UPDATE registro_facturacion SET exportado_en = ? WHERE id IN (" + rows.map(() => "?").join(",") + ")", [this.nowIso(), ...rows.map((r) => r.id)]);
    this.auditar("registros.exportar", { desdeIso, hastaIso, n: rows.length });
    return { ficheros: [...ex.ficheros, ...firmados], resumen: ex.resumen };
  }
  async exportarEventos(obligadoId: number) {
    const evs = this.db.all<any>("SELECT * FROM registro_evento WHERE obligado_id = ? ORDER BY id", [obligadoId]);
    if (!evs.length) throw new Error("No hay eventos");
    const first = JSON.parse(evs[0].evento_json) as RegistroEvento, last = JSON.parse(evs[evs.length - 1].evento_json) as RegistroEvento;
    const ref = (e: RegistroEvento) => ({ TipoEvento: e.Evento.TipoEvento, FechaHoraHusoEvento: e.Evento.FechaHoraHusoGenEvento, HuellaEvento: e.Evento.HuellaEvento });
    const ficheros = evs.map((e) => ({ nombre: `eventos/${String(e.id).padStart(8, "0")}-${e.tipo}.xml`, contenido: e.xml as string }));
    await this.registrarEvento(obligadoId, "09", { ExportacionRegEventoPeriodo: { FechaHoraHusoInicioPeriodoExport: first.Evento.FechaHoraHusoGenEvento,
      FechaHoraHusoFinPeriodoExport: last.Evento.FechaHoraHusoGenEvento, RegistroEventoInicialPeriodo: ref(first), RegistroEventoFinalPeriodo: ref(last),
      NumeroDeRegEventoExportados: evs.length, RegEventoExportadosDejanDeConservarse: "N" } });
    return ficheros;
  }
}
