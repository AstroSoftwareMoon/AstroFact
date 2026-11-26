/**
 * Gestión comercial (no forma parte del sistema de registros de facturación): gastos y tickets con
 * adjuntos, presupuestos, albaranes y borradores, facturas recurrentes, cobros e impagos y conciliación
 * bancaria simple. Extiende AstroFactStore (mismos métodos en local y en servidor).
 */
import { calcularTotales, D, fmtImporte, isValidNif, normalizeNif, sum, type FacturaBorrador } from "@astrofact/fiscal-core";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { tx } from "./driver";
import { AstroFactStore, type BorradorUI } from "./store";
import type { Factura } from "./types";

export type CategoriaGasto = "compras" | "suministros" | "alquiler" | "servicios_profesionales" | "transporte" | "software" | "material_oficina" | "publicidad" | "seguros" | "formacion" | "tributos" | "comisiones_bancarias" | "otros";
export const CATEGORIAS_GASTO: Record<CategoriaGasto, string> = {
  compras: "Compras de mercaderías", suministros: "Suministros (luz, agua, internet…)", alquiler: "Alquiler", servicios_profesionales: "Servicios profesionales",
  transporte: "Transporte y desplazamientos", software: "Software y suscripciones", material_oficina: "Material de oficina", publicidad: "Publicidad y marketing",
  seguros: "Seguros", formacion: "Formación", tributos: "Tributos", comisiones_bancarias: "Comisiones bancarias", otros: "Otros",
};

export interface LineaGasto { base: string; tipo: string; cuota?: string; recargo?: string; cuotaRecargo?: string; }
export interface Gasto {
  id: number; obligadoId: number; proveedorId?: number; proveedorNombre: string; proveedorNif?: string; fecha: string; numero?: string; concepto: string;
  categoria: CategoriaGasto; desglose: Required<LineaGasto>[]; baseTotal: string; cuotaTotal: string; retencion: string; total: string;
  pctDeducible: string; inversionSujetoPasivo: boolean; estadoPago: "pendiente" | "pagado"; fechaPago?: string; vencimiento?: string; notas?: string; adjuntos: number;
}
export type GastoEntrada = Omit<Gasto, "id" | "obligadoId" | "desglose" | "baseTotal" | "cuotaTotal" | "total" | "adjuntos" | "estadoPago" | "retencion" | "pctDeducible" | "inversionSujetoPasivo" | "categoria"> & {
  id?: number; desglose: LineaGasto[]; retencion?: string; pctDeducible?: string; inversionSujetoPasivo?: boolean; estadoPago?: "pendiente" | "pagado"; categoria?: CategoriaGasto;
};
export interface Adjunto { id: number; entidad: string; entidadId: number; nombre: string; mime: string; tamano: number; sha256: string; creadoEn: string; }

export type ClaseDocumento = "presupuesto" | "albaran" | "borrador";
export type EstadoDocumento = "abierto" | "enviado" | "aceptado" | "rechazado" | "facturado" | "anulado";
export interface Documento {
  id: number; obligadoId: number; clase: ClaseDocumento; numero: string; fecha: string; validez?: string; terceroId?: number; estado: EstadoDocumento;
  borrador: BorradorUI; total: string; facturaId?: number; origenId?: number; recurrenciaId?: number; notas?: string;
}
export type Periodicidad = "mensual" | "trimestral" | "semestral" | "anual";
export interface Recurrencia { id: number; obligadoId: number; nombre: string; serieId: number; borrador: BorradorUI; periodicidad: Periodicidad; proxima: string; hasta?: string; autoEmitir: boolean; activa: boolean; ultimaFacturaId?: number; }
export interface Cobro { id: number; facturaId: number; fecha: string; importe: string; medio?: string; nota?: string; movimientoId?: number; }
export interface Movimiento { id: number; fecha: string; concepto: string; importe: string; cobroId?: number; gastoId?: number; }
export interface SugerenciaConciliacion { movimientoId: number; tipo: "factura" | "gasto"; id: number; etiqueta: string; pendiente: string; confianza: "alta" | "media"; }

const MAX_ADJUNTO = 10 * 1024 * 1024;
const MIME_ADJUNTO = /^(application\/pdf|image\/(png|jpeg|webp|heic|heif)|text\/(plain|csv|xml)|application\/xml)$/;

/** Suma meses a una fecha ISO conservando el día (ajustado al último del mes si no existe). */
export function sumarMeses(iso: string, meses: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1 + meses, 1));
  const ult = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, ult)).padStart(2, "0")}`;
}
export const MESES_PERIODO: Record<Periodicidad, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };

/** Desglose de gasto normalizado (cuotas calculadas si no se indican, redondeo half-up). */
export function calcularGasto(lineas: LineaGasto[], retencionPct?: string) {
  const desglose = lineas.map((l) => {
    const base = D(l.base);
    const cuota = l.cuota !== undefined && l.cuota !== "" ? D(l.cuota) : base.mul(l.tipo || "0").div(100, 6).round(2);
    const cuotaRecargo = l.recargo ? (l.cuotaRecargo ? D(l.cuotaRecargo) : base.mul(l.recargo).div(100, 6).round(2)) : D(0);
    return { base: fmtImporte(base), tipo: D(l.tipo || "0").toPlain(), cuota: fmtImporte(cuota), recargo: l.recargo ? D(l.recargo).toPlain() : "", cuotaRecargo: fmtImporte(cuotaRecargo) };
  });
  const base = sum(desglose.map((x) => D(x.base))), cuota = sum(desglose.map((x) => D(x.cuota).add(x.cuotaRecargo)));
  const retencion = retencionPct ? base.mul(retencionPct).div(100, 6).round(2) : D(0);
  return { desglose, baseTotal: fmtImporte(base), cuotaTotal: fmtImporte(cuota), retencion: fmtImporte(retencion), total: fmtImporte(base.add(cuota).sub(retencion)) };
}

/** Texto de recordatorio de pago (sin datos de terceros más allá de la factura). */
export function textoRecordatorio(f: Factura, emisor: string, iban?: string, diasVencida = 0): { asunto: string; cuerpo: string } {
  const total = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(Number(f.totales.totalAPagar));
  const fecha = f.fechaExpedicion.split("-").reverse().join("/");
  return {
    asunto: `Recordatorio de pago · factura ${f.numSerie}`,
    cuerpo: `Hola,\n\nTe escribimos para recordarte que la factura ${f.numSerie} del ${fecha}, por importe de ${total}, figura pendiente de pago${diasVencida > 0 ? ` (vencida hace ${diasVencida} días)` : ""}.\n\n${iban ? `Puedes realizar el pago por transferencia a ${iban}, indicando el número de factura.\n\n` : ""}Si ya la has abonado, ignora este mensaje.\n\nUn saludo,\n${emisor}`,
  };
}

declare module "./store" {
  interface AstroFactStore {
    gastos(obligadoId: number, f?: { desde?: string; hasta?: string; buscar?: string }): Gasto[];
    gasto(id: number): Gasto | undefined;
    guardarGasto(obligadoId: number, g: GastoEntrada, retencionPct?: string): Gasto;
    eliminarGasto(id: number): void;
    marcarGastoPagado(id: number, fecha: string | null): void;
    anadirAdjunto(obligadoId: number, entidad: "gasto" | "factura" | "documento", entidadId: number, a: { nombre: string; mime: string; datos: Uint8Array }): Adjunto;
    adjuntos(entidad: string, entidadId: number): Adjunto[];
    adjuntoDatos(id: number): { nombre: string; mime: string; datos: Uint8Array } | undefined;
    eliminarAdjunto(id: number): void;
    documentos(obligadoId: number, clase?: ClaseDocumento): Documento[];
    documento(id: number): Documento | undefined;
    guardarDocumento(obligadoId: number, d: { id?: number; clase: ClaseDocumento; borrador: BorradorUI; fecha?: string; validez?: string; notas?: string }): Documento;
    cambiarEstadoDocumento(id: number, estado: EstadoDocumento): void;
    convertirEnAlbaran(presupuestoId: number): Documento;
    facturarDocumentos(obligadoId: number, serieId: number, ids: number[], extra?: Partial<BorradorUI>): Promise<Factura>;
    recurrencias(obligadoId: number): Recurrencia[];
    guardarRecurrencia(obligadoId: number, r: Omit<Recurrencia, "id" | "obligadoId" | "activa" | "ultimaFacturaId"> & { id?: number; activa?: boolean }): Recurrencia;
    procesarRecurrentes(obligadoId: number): Promise<{ emitidas: Factura[]; borradores: Documento[]; errores: string[] }>;
    cobros(facturaId: number): Cobro[];
    registrarCobro(facturaId: number, c: { fecha: string; importe: string; medio?: string; nota?: string; movimientoId?: number }): Cobro;
    eliminarCobro(id: number): void;
    pendienteDeCobro(facturaId: number): string;
    facturasVencidas(obligadoId: number, diasPagoDefecto?: number): (Factura & { diasVencida: number; pendiente: string; recordatorios: number })[];
    registrarRecordatorio(facturaId: number, canal: "email" | "whatsapp" | "otro", nota?: string): void;
    importarMovimientos(obligadoId: number, filas: { fecha: string; concepto: string; importe: string }[]): { nuevos: number; duplicados: number };
    movimientos(obligadoId: number, soloPendientes?: boolean): Movimiento[];
    sugerenciasConciliacion(obligadoId: number): SugerenciaConciliacion[];
    conciliar(movimientoId: number, destino: { facturaId: number } | { gastoId: number }): void;
  }
}

const P = AstroFactStore.prototype as AstroFactStore & Record<string, any>;
const pj = <T>(s: unknown) => (typeof s === "string" && s ? (JSON.parse(s) as T) : undefined);
const now = (s: AstroFactStore) => (s as any).ahora().toISOString() as string;
const cambio = (s: AstroFactStore) => (s as any).cambiado();

/* ------------------------------ Gastos ------------------------------ */
const mapGasto = (r: any): Gasto => ({ id: r.id, obligadoId: r.obligado_id, proveedorId: r.proveedor_id ?? undefined, proveedorNombre: r.proveedor_nombre, proveedorNif: r.proveedor_nif ?? undefined,
  fecha: r.fecha, numero: r.numero ?? undefined, concepto: r.concepto, categoria: r.categoria, desglose: JSON.parse(r.desglose_json), baseTotal: r.base_total, cuotaTotal: r.cuota_total,
  retencion: r.retencion, total: r.total, pctDeducible: r.pct_deducible, inversionSujetoPasivo: r.inversion_sujeto_pasivo === 1, estadoPago: r.estado_pago, fechaPago: r.fecha_pago ?? undefined,
  vencimiento: r.vencimiento ?? undefined, notas: r.notas ?? undefined, adjuntos: r.n_adj ?? 0 });
const SEL_GASTO = "SELECT g.*, (SELECT COUNT(*) FROM adjunto a WHERE a.entidad = 'gasto' AND a.entidad_id = g.id) AS n_adj FROM gasto g";
P.gastos = function (obligadoId, f = {}) {
  const q = `%${(f.buscar ?? "").trim()}%`;
  return this.db.all(`${SEL_GASTO} WHERE g.obligado_id = ? AND g.fecha >= ? AND g.fecha <= ? AND (g.proveedor_nombre LIKE ? OR g.concepto LIKE ? OR IFNULL(g.numero,'') LIKE ?) ORDER BY g.fecha DESC, g.id DESC`,
    [obligadoId, f.desde ?? "0000", f.hasta ?? "9999", q, q, q]).map(mapGasto);
};
P.gasto = function (id) { const r = this.db.get(`${SEL_GASTO} WHERE g.id = ?`, [id]); return r ? mapGasto(r) : undefined; };
P.guardarGasto = function (obligadoId, g, retencionPct) {
  if (!g.proveedorNombre?.trim()) throw new Error("Indica el proveedor");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(g.fecha)) throw new Error("Fecha no válida");
  if (!g.desglose.length) throw new Error("Añade al menos una base imponible");
  const nif = g.proveedorNif ? normalizeNif(g.proveedorNif) : undefined;
  if (nif && /^[0-9XYZKLMA-W]/.test(nif) && nif.length === 9 && !isValidNif(nif)) throw new Error(`NIF del proveedor no válido: ${g.proveedorNif}`);
  const c = calcularGasto(g.desglose, retencionPct);
  const retencion = g.retencion !== undefined && !retencionPct ? fmtImporte(g.retencion) : c.retencion;
  const total = fmtImporte(D(c.baseTotal).add(c.cuotaTotal).sub(retencion));
  const vals = [g.proveedorId ?? null, g.proveedorNombre.trim(), nif ?? null, g.fecha, g.numero ?? null, g.concepto?.trim() || g.proveedorNombre.trim(), g.categoria ?? "otros",
    JSON.stringify(c.desglose), c.baseTotal, c.cuotaTotal, retencion, total, D(g.pctDeducible ?? "100").toPlain(), g.inversionSujetoPasivo ? 1 : 0,
    g.estadoPago ?? "pendiente", g.fechaPago ?? null, g.vencimiento ?? null, g.notas ?? null, now(this)];
  let id = g.id;
  if (id) this.db.run(`UPDATE gasto SET proveedor_id=?, proveedor_nombre=?, proveedor_nif=?, fecha=?, numero=?, concepto=?, categoria=?, desglose_json=?, base_total=?, cuota_total=?, retencion=?, total=?,
    pct_deducible=?, inversion_sujeto_pasivo=?, estado_pago=?, fecha_pago=?, vencimiento=?, notas=?, actualizado_en=? WHERE id=? AND obligado_id=?`, [...vals, id, obligadoId]);
  else id = this.db.run(`INSERT INTO gasto (proveedor_id, proveedor_nombre, proveedor_nif, fecha, numero, concepto, categoria, desglose_json, base_total, cuota_total, retencion, total,
    pct_deducible, inversion_sujeto_pasivo, estado_pago, fecha_pago, vencimiento, notas, actualizado_en, obligado_id, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [...vals, obligadoId, now(this)]).lastInsertRowid;
  this.auditar("gasto.guardar", { id });
  cambio(this);
  return this.gasto(id)!;
};
P.eliminarGasto = function (id) { tx(this.db, () => { this.db.run("DELETE FROM adjunto WHERE entidad = 'gasto' AND entidad_id = ?", [id]); this.db.run("UPDATE movimiento SET gasto_id = NULL WHERE gasto_id = ?", [id]); this.db.run("DELETE FROM gasto WHERE id = ?", [id]); }); this.auditar("gasto.eliminar", { id }); cambio(this); };
P.marcarGastoPagado = function (id, fecha) { this.db.run("UPDATE gasto SET estado_pago = ?, fecha_pago = ? WHERE id = ?", [fecha ? "pagado" : "pendiente", fecha, id]); cambio(this); };

/* ------------------------------ Adjuntos ------------------------------ */
const mapAdj = (r: any): Adjunto => ({ id: r.id, entidad: r.entidad, entidadId: r.entidad_id, nombre: r.nombre, mime: r.mime, tamano: r.tamano, sha256: r.sha256, creadoEn: r.creado_en });
P.anadirAdjunto = function (obligadoId, entidad, entidadId, a) {
  if (a.datos.length > MAX_ADJUNTO) throw new Error("El adjunto supera 10 MB");
  if (!MIME_ADJUNTO.test(a.mime)) throw new Error("Tipo de archivo no admitido (PDF, imagen, texto o XML)");
  const id = this.db.run("INSERT INTO adjunto (obligado_id, entidad, entidad_id, nombre, mime, tamano, sha256, datos, creado_en) VALUES (?,?,?,?,?,?,?,?,?)",
    [obligadoId, entidad, entidadId, a.nombre.slice(0, 200), a.mime, a.datos.length, bytesToHex(sha256(a.datos)), a.datos, now(this)]).lastInsertRowid;
  cambio(this);
  return mapAdj(this.db.get("SELECT * FROM adjunto WHERE id = ?", [id]));
};
P.adjuntos = function (entidad, entidadId) { return this.db.all("SELECT id, entidad, entidad_id, nombre, mime, tamano, sha256, creado_en FROM adjunto WHERE entidad = ? AND entidad_id = ? ORDER BY id", [entidad, entidadId]).map(mapAdj); };
P.adjuntoDatos = function (id) { const r = this.db.get<any>("SELECT nombre, mime, datos FROM adjunto WHERE id = ?", [id]); return r ? { nombre: r.nombre, mime: r.mime, datos: new Uint8Array(r.datos) } : undefined; };
P.eliminarAdjunto = function (id) {
  const r = this.db.get<any>("SELECT entidad FROM adjunto WHERE id = ?", [id]);
  if (r?.entidad === "factura") throw new Error("Los adjuntos de una factura emitida se conservan");
  this.db.run("DELETE FROM adjunto WHERE id = ?", [id]); cambio(this);
};

/* ------------------------------ Presupuestos, albaranes y borradores ------------------------------ */
const mapDoc = (r: any): Documento => ({ id: r.id, obligadoId: r.obligado_id, clase: r.clase, numero: r.numero, fecha: r.fecha, validez: r.validez ?? undefined, terceroId: r.tercero_id ?? undefined,
  estado: r.estado, borrador: JSON.parse(r.borrador_json), total: r.total, facturaId: r.factura_id ?? undefined, origenId: r.origen_id ?? undefined, recurrenciaId: r.recurrencia_id ?? undefined, notas: r.notas ?? undefined });
const PREFIJO: Record<ClaseDocumento, string> = { presupuesto: "P", albaran: "AL", borrador: "B" };
function siguienteNumeroDoc(s: AstroFactStore, obligadoId: number, clase: ClaseDocumento, fecha: string) {
  const anio = fecha.slice(0, 4);
  const n = (s.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM documento WHERE obligado_id = ? AND clase = ? AND substr(fecha,1,4) = ?", [obligadoId, clase, anio])?.n ?? 0) + 1;
  return `${PREFIJO[clase]}-${anio}-${String(n).padStart(4, "0")}`;
}
P.documentos = function (obligadoId, clase) {
  return this.db.all(`SELECT * FROM documento WHERE obligado_id = ? ${clase ? "AND clase = ?" : ""} ORDER BY fecha DESC, id DESC`, clase ? [obligadoId, clase] : [obligadoId]).map(mapDoc);
};
P.documento = function (id) { const r = this.db.get("SELECT * FROM documento WHERE id = ?", [id]); return r ? mapDoc(r) : undefined; };
P.guardarDocumento = function (obligadoId, d) {
  const fecha = d.fecha ?? this.hoy(obligadoId);
  const t = calcularTotales(d.borrador);
  if (d.id) {
    const prev = this.documento(d.id)!;
    if (prev.estado === "facturado") throw new Error("Un documento ya facturado no se puede modificar");
    this.db.run("UPDATE documento SET fecha=?, validez=?, tercero_id=?, borrador_json=?, total=?, notas=?, actualizado_en=? WHERE id=?",
      [fecha, d.validez ?? null, d.borrador.terceroId ?? null, JSON.stringify(d.borrador), t.importeTotal.toFixed(2), d.notas ?? null, now(this), d.id]);
    cambio(this); return this.documento(d.id)!;
  }
  const id = this.db.run(`INSERT INTO documento (obligado_id, clase, numero, fecha, validez, tercero_id, borrador_json, total, notas, creado_en, actualizado_en) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [obligadoId, d.clase, siguienteNumeroDoc(this, obligadoId, d.clase, fecha), fecha, d.validez ?? null, d.borrador.terceroId ?? null, JSON.stringify(d.borrador), t.importeTotal.toFixed(2), d.notas ?? null, now(this), now(this)]).lastInsertRowid;
  this.auditar("documento.crear", { id, clase: d.clase }); cambio(this);
  return this.documento(id)!;
};
P.cambiarEstadoDocumento = function (id, estado) {
  const d = this.documento(id); if (!d) throw new Error("Documento inexistente");
  if (d.estado === "facturado") throw new Error("El documento ya está facturado");
  this.db.run("UPDATE documento SET estado = ?, actualizado_en = ? WHERE id = ?", [estado, now(this), id]); cambio(this);
};
P.convertirEnAlbaran = function (presupuestoId) {
  const p = this.documento(presupuestoId); if (!p || p.clase !== "presupuesto") throw new Error("No es un presupuesto");
  const a = this.guardarDocumento(p.obligadoId, { clase: "albaran", borrador: p.borrador, notas: `Según presupuesto ${p.numero}` });
  this.db.run("UPDATE documento SET origen_id = ? WHERE id = ?", [p.id, a.id]);
  if (p.estado === "abierto" || p.estado === "enviado") this.db.run("UPDATE documento SET estado = 'aceptado' WHERE id = ?", [p.id]);
  cambio(this); return this.documento(a.id)!;
};
/** Una factura a partir de uno o varios documentos (p. ej. agrupar los albaranes del mes de un cliente). */
P.facturarDocumentos = async function (obligadoId, serieId, ids, extra = {}) {
  const docs = ids.map((i) => this.documento(i)!).filter(Boolean);
  if (!docs.length) throw new Error("Selecciona algún documento");
  if (docs.some((d) => d.estado === "facturado" || d.estado === "anulado")) throw new Error("Algún documento ya está facturado o anulado");
  const terceros = new Set(docs.map((d) => d.terceroId ?? 0));
  if (terceros.size > 1) throw new Error("Solo se pueden agrupar documentos del mismo cliente");
  const b0 = docs[0]!.borrador;
  const varios = docs.length > 1;
  const borrador: BorradorUI = {
    ...b0, ...extra,
    lineas: docs.flatMap((d) => d.borrador.lineas.map((l) => ({ ...l, descripcion: varios || d.clase === "albaran" ? `${l.descripcion} (${d.numero})` : l.descripcion }))),
    descripcionOperacion: extra.descripcionOperacion ?? (varios ? `Según ${docs.map((d) => d.numero).join(", ")}` : b0.descripcionOperacion),
  };
  const f = await this.emitir(obligadoId, serieId, borrador);
  this.db.run(`UPDATE documento SET estado = 'facturado', factura_id = ?, actualizado_en = ? WHERE id IN (${ids.map(() => "?").join(",")})`, [f.id, now(this), ...ids]);
  // Si un albarán venía de un presupuesto, el presupuesto también queda facturado
  for (const d of docs) if (d.origenId) this.db.run("UPDATE documento SET estado = 'facturado', factura_id = ? WHERE id = ? AND estado <> 'facturado'", [f.id, d.origenId]);
  cambio(this);
  return f;
};

/* ------------------------------ Recurrentes ------------------------------ */
const mapRec = (r: any): Recurrencia => ({ id: r.id, obligadoId: r.obligado_id, nombre: r.nombre, serieId: r.serie_id, borrador: JSON.parse(r.borrador_json), periodicidad: r.periodicidad,
  proxima: r.proxima, hasta: r.hasta ?? undefined, autoEmitir: r.auto_emitir === 1, activa: r.activa === 1, ultimaFacturaId: r.ultima_factura_id ?? undefined });
P.recurrencias = function (obligadoId) { return this.db.all("SELECT * FROM recurrencia WHERE obligado_id = ? ORDER BY activa DESC, proxima", [obligadoId]).map(mapRec); };
P.guardarRecurrencia = function (obligadoId, r) {
  if (!r.nombre.trim()) throw new Error("Pon un nombre a la recurrencia");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(r.proxima)) throw new Error("Fecha de la próxima factura no válida");
  const vals = [r.nombre.trim(), r.serieId, JSON.stringify(r.borrador), r.periodicidad, r.proxima, r.hasta ?? null, r.autoEmitir ? 1 : 0, r.activa === false ? 0 : 1];
  let id = r.id;
  if (id) this.db.run("UPDATE recurrencia SET nombre=?, serie_id=?, borrador_json=?, periodicidad=?, proxima=?, hasta=?, auto_emitir=?, activa=? WHERE id=? AND obligado_id=?", [...vals, id, obligadoId]);
  else id = this.db.run("INSERT INTO recurrencia (nombre, serie_id, borrador_json, periodicidad, proxima, hasta, auto_emitir, activa, obligado_id, creado_en) VALUES (?,?,?,?,?,?,?,?,?,?)", [...vals, obligadoId, now(this)]).lastInsertRowid;
  cambio(this);
  return mapRec(this.db.get("SELECT * FROM recurrencia WHERE id = ?", [id]));
};
/**
 * Genera lo que toca a fecha de hoy. Con «emitir automáticamente» (y certificado disponible) emite la factura
 * con fecha de hoy; si no, deja un borrador para revisar. Nunca emite con fecha pasada.
 */
P.procesarRecurrentes = async function (obligadoId) {
  const hoy = this.hoy(obligadoId);
  const out = { emitidas: [] as Factura[], borradores: [] as Documento[], errores: [] as string[] };
  for (const r of this.recurrencias(obligadoId).filter((x) => x.activa && x.proxima <= hoy)) {
    let proxima = r.proxima;
    while (proxima <= hoy) proxima = sumarMeses(proxima, MESES_PERIODO[r.periodicidad]);
    const periodo = `${r.nombre} (${r.proxima.split("-").reverse().join("/")})`;
    const borrador: BorradorUI = { ...r.borrador, descripcionOperacion: r.borrador.descripcionOperacion || periodo };
    try {
      if (r.autoEmitir) {
        const f = await this.emitir(obligadoId, r.serieId, borrador);
        out.emitidas.push(f);
        this.db.run("UPDATE recurrencia SET ultima_factura_id = ? WHERE id = ?", [f.id, r.id]);
      } else {
        const d = this.guardarDocumento(obligadoId, { clase: "borrador", borrador, notas: `Recurrente: ${periodo}` });
        this.db.run("UPDATE documento SET recurrencia_id = ? WHERE id = ?", [r.id, d.id]);
        out.borradores.push(d);
      }
      this.db.run("UPDATE recurrencia SET proxima = ?, activa = CASE WHEN hasta IS NOT NULL AND ? > hasta THEN 0 ELSE activa END WHERE id = ?", [proxima, proxima, r.id]);
    } catch (e) { out.errores.push(`${r.nombre}: ${(e as Error).message}`); }
  }
  if (out.emitidas.length || out.borradores.length) cambio(this);
  return out;
};

/* ------------------------------ Cobros e impagos ------------------------------ */
const mapCobro = (r: any): Cobro => ({ id: r.id, facturaId: r.factura_id, fecha: r.fecha, importe: r.importe, medio: r.medio ?? undefined, nota: r.nota ?? undefined, movimientoId: r.movimiento_id ?? undefined });
P.cobros = function (facturaId) { return this.db.all("SELECT * FROM cobro WHERE factura_id = ? ORDER BY fecha, id", [facturaId]).map(mapCobro); };
P.pendienteDeCobro = function (facturaId) {
  const f = this.factura(facturaId)!;
  return fmtImporte(D(f.totales.totalAPagar).sub(sum(this.cobros(facturaId).map((c: Cobro) => D(c.importe)))));
};
function actualizarEstadoCobro(s: AstroFactStore, facturaId: number) {
  const f = s.factura(facturaId)!;
  const cobrado = sum(s.cobros(facturaId).map((c) => D(c.importe)));
  const total = D(f.totales.totalAPagar);
  const estado = cobrado.isZero() ? (f.estadoCobro === "impagada" ? "impagada" : "pendiente") : cobrado.abs().cmp(total.abs()) >= 0 ? "cobrada" : "parcial";
  s.db.run("UPDATE factura SET estado_cobro = ? WHERE id = ?", [estado, facturaId]);
}
P.registrarCobro = function (facturaId, c) {
  const f = this.factura(facturaId); if (!f) throw new Error("Factura inexistente");
  if (f.anulada) throw new Error("La factura está anulada");
  const imp = D(c.importe);
  if (imp.isZero()) throw new Error("Importe no válido");
  const id = tx(this.db, () => {
    const i = this.db.run("INSERT INTO cobro (factura_id, fecha, importe, medio, nota, movimiento_id, creado_en) VALUES (?,?,?,?,?,?,?)", [facturaId, c.fecha, fmtImporte(imp), c.medio ?? null, c.nota ?? null, c.movimientoId ?? null, now(this)]).lastInsertRowid;
    actualizarEstadoCobro(this, facturaId);
    return i;
  });
  this.auditar("cobro.registrar", { facturaId, importe: c.importe }); cambio(this);
  return mapCobro(this.db.get("SELECT * FROM cobro WHERE id = ?", [id]));
};
P.eliminarCobro = function (id) {
  const c = this.db.get<any>("SELECT factura_id FROM cobro WHERE id = ?", [id]); if (!c) return;
  tx(this.db, () => { this.db.run("UPDATE movimiento SET cobro_id = NULL WHERE cobro_id = ?", [id]); this.db.run("DELETE FROM cobro WHERE id = ?", [id]); actualizarEstadoCobro(this, c.factura_id); });
  cambio(this);
};
P.facturasVencidas = function (obligadoId, diasPagoDefecto = 30) {
  const hoy = this.hoy(obligadoId);
  const dia = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86400_000;
  return this.facturas(obligadoId).filter((f: Factura) => !f.anulada && f.estadoCobro !== "cobrada" && D(f.totales.totalAPagar).sign() > 0)
    .map((f: Factura) => {
      const venc = f.vencimiento ?? new Date((dia(f.fechaExpedicion) + diasPagoDefecto) * 86400_000).toISOString().slice(0, 10);
      return { ...f, vencimiento: venc, diasVencida: dia(hoy) - dia(venc), pendiente: this.pendienteDeCobro(f.id),
        recordatorios: this.db.get<{ n: number }>("SELECT COUNT(*) AS n FROM recordatorio WHERE factura_id = ?", [f.id])?.n ?? 0 };
    }).filter((f: { diasVencida: number }) => f.diasVencida > 0).sort((a: { diasVencida: number }, b: { diasVencida: number }) => b.diasVencida - a.diasVencida);
};
P.registrarRecordatorio = function (facturaId, canal, nota) {
  this.db.run("INSERT INTO recordatorio (factura_id, fecha, canal, nota) VALUES (?,?,?,?)", [facturaId, now(this), canal, nota ?? null]);
  this.auditar("recordatorio", { facturaId, canal }); cambio(this);
};

/* ------------------------------ Conciliación bancaria simple ------------------------------ */
const mapMov = (r: any): Movimiento => ({ id: r.id, fecha: r.fecha, concepto: r.concepto, importe: r.importe, cobroId: r.cobro_id ?? undefined, gastoId: r.gasto_id ?? undefined });
P.importarMovimientos = function (obligadoId, filas) {
  let nuevos = 0, duplicados = 0;
  const vistos = new Map<string, number>();
  tx(this.db, () => {
    for (const f of filas) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) throw new Error(`Fecha no válida en el extracto: ${f.fecha}`);
      const imp = fmtImporte(f.importe);
      const base = `${f.fecha}|${imp}|${f.concepto.trim()}`;
      const k = (vistos.get(base) ?? 0) + 1; vistos.set(base, k); // dos movimientos idénticos el mismo día son distintos
      const huella = bytesToHex(sha256(utf8ToBytes(`${base}|${k}`)));
      const r = this.db.run("INSERT OR IGNORE INTO movimiento (obligado_id, fecha, concepto, importe, huella, creado_en) VALUES (?,?,?,?,?,?)", [obligadoId, f.fecha, f.concepto.trim().slice(0, 300), imp, huella, now(this)]);
      if (r.changes) nuevos++; else duplicados++;
    }
  });
  cambio(this);
  return { nuevos, duplicados };
};
P.movimientos = function (obligadoId, soloPendientes = false) {
  return this.db.all(`SELECT * FROM movimiento WHERE obligado_id = ? ${soloPendientes ? "AND cobro_id IS NULL AND gasto_id IS NULL" : ""} ORDER BY fecha DESC, id DESC`, [obligadoId]).map(mapMov);
};
P.sugerenciasConciliacion = function (obligadoId) {
  const out: SugerenciaConciliacion[] = [];
  const pendientesF = this.facturas(obligadoId).filter((f: Factura) => !f.anulada && f.estadoCobro !== "cobrada").map((f: Factura) => ({ f, pend: this.pendienteDeCobro(f.id) }));
  const pendientesG = this.gastos(obligadoId).filter((g: Gasto) => g.estadoPago === "pendiente");
  const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");
  for (const m of this.movimientos(obligadoId, true)) {
    const imp = D(m.importe); const c = norm(m.concepto);
    if (imp.sign() > 0) {
      const cand = pendientesF.filter((x: { pend: string }) => D(x.pend).eq(imp));
      const porNumero = cand.find((x: { f: Factura }) => c.includes(norm(x.f.numSerie)));
      const elegido = porNumero ?? (cand.length === 1 ? cand[0] : cand.find((x: { f: Factura }) => { const n = norm(x.f.datos.destinatarios?.[0]?.nombre ?? ""); return n.length > 3 && c.includes(n.slice(0, 8)); }));
      if (elegido) out.push({ movimientoId: m.id, tipo: "factura", id: elegido.f.id, etiqueta: `${elegido.f.numSerie} · ${elegido.f.datos.destinatarios?.[0]?.nombre ?? ""}`, pendiente: elegido.pend, confianza: porNumero ? "alta" : "media" });
    } else if (imp.sign() < 0) {
      const cand = pendientesG.filter((g: Gasto) => D(g.total).eq(imp.neg()));
      const porNombre = cand.find((g: Gasto) => c.includes(norm(g.proveedorNombre).slice(0, 8)));
      const elegido = porNombre ?? (cand.length === 1 ? cand[0] : undefined);
      if (elegido) out.push({ movimientoId: m.id, tipo: "gasto", id: elegido.id, etiqueta: `${elegido.proveedorNombre}${elegido.numero ? ` · ${elegido.numero}` : ""}`, pendiente: elegido.total, confianza: porNombre ? "alta" : "media" });
    }
  }
  return out;
};
P.conciliar = function (movimientoId, destino) {
  const m = this.db.get<any>("SELECT * FROM movimiento WHERE id = ?", [movimientoId]);
  if (!m) throw new Error("Movimiento inexistente");
  if (m.cobro_id || m.gasto_id) throw new Error("El movimiento ya está conciliado");
  if ("facturaId" in destino) {
    const c = this.registrarCobro(destino.facturaId, { fecha: m.fecha, importe: m.importe, medio: "transferencia", nota: m.concepto, movimientoId });
    this.db.run("UPDATE movimiento SET cobro_id = ? WHERE id = ?", [c.id, movimientoId]);
  } else {
    this.db.run("UPDATE gasto SET estado_pago = 'pagado', fecha_pago = ? WHERE id = ?", [m.fecha, destino.gastoId]);
    this.db.run("UPDATE movimiento SET gasto_id = ? WHERE id = ?", [destino.gastoId, movimientoId]);
  }
  this.auditar("conciliacion", { movimientoId, ...destino }); cambio(this);
};

export type { FacturaBorrador };
