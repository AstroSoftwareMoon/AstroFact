/**
 * Migraciones versionadas. NUNCA se modifica una migración publicada: se añade otra.
 * Inmutabilidad (art. 8 RRSIF; arts. 6–8 Orden): triggers que impiden borrar o alterar
 * registros de facturación, eventos y datos fiscales de facturas emitidas.
 */
import { tx, type SqlDriver } from "./driver";

export const MIGRACIONES: { version: number; nombre: string; sql: string }[] = [
  { version: 1, nombre: "esquema inicial", sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, nombre TEXT, aplicada_en TEXT NOT NULL);
CREATE TABLE meta (clave TEXT PRIMARY KEY, valor TEXT);
CREATE TABLE obligado (
  id INTEGER PRIMARY KEY, nif TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL, direccion_json TEXT,
  email TEXT, telefono TEXT, iban TEXT, territorio TEXT NOT NULL DEFAULT 'peninsula',
  modo TEXT NOT NULL DEFAULT 'no_verifactu' CHECK (modo IN ('verifactu','no_verifactu')),
  entorno TEXT NOT NULL DEFAULT 'pruebas' CHECK (entorno IN ('pruebas','produccion')),
  pie_legal TEXT, creado_en TEXT NOT NULL
);
CREATE TABLE certificado (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id),
  titular TEXT, nif TEXT, valido_desde TEXT, valido_hasta TEXT, de_pruebas INTEGER NOT NULL DEFAULT 0,
  p12_cifrado BLOB NOT NULL, kdf_json TEXT NOT NULL, activo INTEGER NOT NULL DEFAULT 1, creado_en TEXT NOT NULL
);
CREATE TABLE serie (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), codigo TEXT NOT NULL,
  plantilla TEXT NOT NULL, clase TEXT NOT NULL DEFAULT 'ordinaria' CHECK (clase IN ('ordinaria','rectificativa','simplificada')),
  reinicio_anual INTEGER NOT NULL DEFAULT 1, ultimo_numero INTEGER NOT NULL DEFAULT 0, ultima_fecha TEXT, anio INTEGER,
  activa INTEGER NOT NULL DEFAULT 1, UNIQUE (obligado_id, codigo)
);
CREATE TABLE tercero (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id),
  tipo TEXT NOT NULL DEFAULT 'cliente' CHECK (tipo IN ('cliente','proveedor','ambos')),
  nombre TEXT NOT NULL, nif TEXT, id_otro_json TEXT, direccion_json TEXT, email TEXT, telefono TEXT,
  forma_pago TEXT, recargo_equivalencia INTEGER NOT NULL DEFAULT 0, retencion_pct TEXT, notas TEXT,
  anonimizado_en TEXT, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL
);
CREATE TABLE producto (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), codigo TEXT, nombre TEXT NOT NULL,
  descripcion TEXT, precio TEXT NOT NULL, unidad TEXT, impuesto TEXT NOT NULL DEFAULT '01', tipo TEXT,
  calificacion TEXT, exenta TEXT, sujeta_retencion INTEGER NOT NULL DEFAULT 1, activo INTEGER NOT NULL DEFAULT 1,
  creado_en TEXT NOT NULL
);
CREATE TABLE factura (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), serie_id INTEGER NOT NULL REFERENCES serie(id),
  numero INTEGER NOT NULL, num_serie TEXT NOT NULL, fecha_expedicion TEXT NOT NULL, fecha_operacion TEXT,
  tipo_factura TEXT NOT NULL, tipo_rectificativa TEXT, tercero_id INTEGER REFERENCES tercero(id),
  datos_json TEXT NOT NULL, totales_json TEXT NOT NULL,
  base_total TEXT NOT NULL, cuota_total TEXT NOT NULL, importe_total TEXT NOT NULL, retencion TEXT NOT NULL, total_a_pagar TEXT NOT NULL,
  qr_url TEXT NOT NULL, de_pruebas INTEGER NOT NULL DEFAULT 0,
  estado_cobro TEXT NOT NULL DEFAULT 'pendiente', vencimiento TEXT,
  anulada INTEGER NOT NULL DEFAULT 0, rectificada_por INTEGER, emitida_en TEXT NOT NULL,
  UNIQUE (obligado_id, num_serie)
);
CREATE TABLE registro_facturacion (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), factura_id INTEGER REFERENCES factura(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('alta','anulacion')), num_serie TEXT NOT NULL, fecha_expedicion TEXT NOT NULL,
  fecha_hora_gen TEXT NOT NULL, huella TEXT NOT NULL UNIQUE, huella_anterior TEXT,
  registro_json TEXT NOT NULL, xml TEXT NOT NULL, firmado INTEGER NOT NULL DEFAULT 0,
  exportado_en TEXT, conservado INTEGER NOT NULL DEFAULT 1
);
CREATE UNIQUE INDEX ux_rf_cadena ON registro_facturacion(obligado_id, IFNULL(huella_anterior, '-'));
CREATE TABLE registro_evento (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), tipo TEXT NOT NULL,
  fecha_hora_gen TEXT NOT NULL, huella TEXT NOT NULL UNIQUE, huella_anterior TEXT,
  evento_json TEXT NOT NULL, xml TEXT NOT NULL, firmado INTEGER NOT NULL DEFAULT 0, exportado_en TEXT
);
CREATE UNIQUE INDEX ux_ev_cadena ON registro_evento(obligado_id, IFNULL(huella_anterior, '-'));
CREATE TABLE alarma (
  id INTEGER PRIMARY KEY, obligado_id INTEGER, tipo TEXT NOT NULL, mensaje TEXT NOT NULL, detalle_json TEXT,
  creada_en TEXT NOT NULL, resuelta_en TEXT
);
CREATE TABLE auditoria (id INTEGER PRIMARY KEY, ts TEXT NOT NULL, accion TEXT NOT NULL, detalle_json TEXT);

CREATE TRIGGER rf_no_delete BEFORE DELETE ON registro_facturacion
BEGIN SELECT RAISE(ABORT, 'Los registros de facturación son inalterables'); END;
CREATE TRIGGER rf_no_update BEFORE UPDATE ON registro_facturacion
WHEN NEW.xml IS NOT OLD.xml OR NEW.registro_json IS NOT OLD.registro_json OR NEW.huella IS NOT OLD.huella
  OR NEW.huella_anterior IS NOT OLD.huella_anterior OR NEW.fecha_hora_gen IS NOT OLD.fecha_hora_gen
  OR NEW.tipo IS NOT OLD.tipo OR NEW.factura_id IS NOT OLD.factura_id OR NEW.num_serie IS NOT OLD.num_serie
  OR (NEW.firmado IS NOT OLD.firmado AND OLD.firmado = 1)
BEGIN SELECT RAISE(ABORT, 'Los registros de facturación son inalterables'); END;
CREATE TRIGGER ev_no_delete BEFORE DELETE ON registro_evento
BEGIN SELECT RAISE(ABORT, 'Los registros de evento son inalterables'); END;
CREATE TRIGGER ev_no_update BEFORE UPDATE ON registro_evento
WHEN NEW.evento_json IS NOT OLD.evento_json OR NEW.huella IS NOT OLD.huella OR NEW.huella_anterior IS NOT OLD.huella_anterior
  OR (OLD.firmado = 1 AND NEW.xml IS NOT OLD.xml)
BEGIN SELECT RAISE(ABORT, 'Los registros de evento son inalterables'); END;
CREATE TRIGGER fa_no_delete BEFORE DELETE ON factura
BEGIN SELECT RAISE(ABORT, 'Una factura emitida no se puede borrar: emita una rectificativa o anúlela'); END;
CREATE TRIGGER fa_no_update BEFORE UPDATE ON factura
WHEN NEW.datos_json IS NOT OLD.datos_json OR NEW.num_serie IS NOT OLD.num_serie OR NEW.numero IS NOT OLD.numero
  OR NEW.fecha_expedicion IS NOT OLD.fecha_expedicion OR NEW.importe_total IS NOT OLD.importe_total
  OR NEW.cuota_total IS NOT OLD.cuota_total OR NEW.base_total IS NOT OLD.base_total OR NEW.tipo_factura IS NOT OLD.tipo_factura
  OR NEW.tercero_id IS NOT OLD.tercero_id OR NEW.qr_url IS NOT OLD.qr_url OR (OLD.anulada = 1 AND NEW.anulada = 0)
BEGIN SELECT RAISE(ABORT, 'Los datos fiscales de una factura emitida no se pueden modificar'); END;
`},
  { version: 2, nombre: "remisión VERI*FACTU", sql: `
ALTER TABLE registro_facturacion ADD COLUMN estado_aeat TEXT;
ALTER TABLE registro_facturacion ADD COLUMN aeat_codigo INTEGER;
ALTER TABLE registro_facturacion ADD COLUMN aeat_descripcion TEXT;
ALTER TABLE registro_facturacion ADD COLUMN aeat_csv TEXT;
ALTER TABLE registro_facturacion ADD COLUMN envio_id INTEGER;
ALTER TABLE registro_facturacion ADD COLUMN situacion TEXT;
CREATE INDEX ix_rf_estado ON registro_facturacion(obligado_id, estado_aeat);
CREATE TABLE envio_aeat (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), creado_en TEXT NOT NULL, finalizado_en TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('enviando','Correcto','ParcialmenteCorrecto','Incorrecto','error_transporte','fault')),
  num_registros INTEGER NOT NULL, csv TEXT, tiempo_espera INTEGER, error TEXT, peticion_xml TEXT, respuesta_xml TEXT
);
`},
  { version: 3, nombre: "gestión comercial: gastos, documentos, recurrentes, cobros, conciliación", sql: `
CREATE TABLE gasto (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), proveedor_id INTEGER REFERENCES tercero(id),
  proveedor_nombre TEXT NOT NULL, proveedor_nif TEXT, fecha TEXT NOT NULL, numero TEXT, concepto TEXT NOT NULL, categoria TEXT NOT NULL DEFAULT 'otros',
  desglose_json TEXT NOT NULL, base_total TEXT NOT NULL, cuota_total TEXT NOT NULL, retencion TEXT NOT NULL DEFAULT '0.00', total TEXT NOT NULL,
  pct_deducible TEXT NOT NULL DEFAULT '100', inversion_sujeto_pasivo INTEGER NOT NULL DEFAULT 0,
  estado_pago TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado_pago IN ('pendiente','pagado')), fecha_pago TEXT, vencimiento TEXT, notas TEXT,
  creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL
);
CREATE INDEX ix_gasto_fecha ON gasto(obligado_id, fecha);
CREATE TABLE adjunto (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), entidad TEXT NOT NULL, entidad_id INTEGER NOT NULL,
  nombre TEXT NOT NULL, mime TEXT NOT NULL, tamano INTEGER NOT NULL, sha256 TEXT NOT NULL, datos BLOB NOT NULL, creado_en TEXT NOT NULL
);
CREATE INDEX ix_adjunto ON adjunto(entidad, entidad_id);
CREATE TABLE documento (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id),
  clase TEXT NOT NULL CHECK (clase IN ('presupuesto','albaran','borrador')), numero TEXT NOT NULL, fecha TEXT NOT NULL, validez TEXT,
  tercero_id INTEGER REFERENCES tercero(id), estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto','enviado','aceptado','rechazado','facturado','anulado')),
  borrador_json TEXT NOT NULL, total TEXT NOT NULL, factura_id INTEGER REFERENCES factura(id), origen_id INTEGER REFERENCES documento(id),
  recurrencia_id INTEGER, notas TEXT, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL, UNIQUE (obligado_id, clase, numero)
);
CREATE TABLE recurrencia (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), nombre TEXT NOT NULL, serie_id INTEGER NOT NULL REFERENCES serie(id),
  borrador_json TEXT NOT NULL, periodicidad TEXT NOT NULL CHECK (periodicidad IN ('mensual','trimestral','semestral','anual')),
  proxima TEXT NOT NULL, hasta TEXT, auto_emitir INTEGER NOT NULL DEFAULT 0, activa INTEGER NOT NULL DEFAULT 1, ultima_factura_id INTEGER, creado_en TEXT NOT NULL
);
CREATE TABLE cobro (
  id INTEGER PRIMARY KEY, factura_id INTEGER NOT NULL REFERENCES factura(id), fecha TEXT NOT NULL, importe TEXT NOT NULL, medio TEXT,
  nota TEXT, movimiento_id INTEGER, creado_en TEXT NOT NULL
);
CREATE TABLE recordatorio (id INTEGER PRIMARY KEY, factura_id INTEGER NOT NULL REFERENCES factura(id), fecha TEXT NOT NULL, canal TEXT NOT NULL, nota TEXT);
CREATE TABLE movimiento (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id), fecha TEXT NOT NULL, concepto TEXT NOT NULL, importe TEXT NOT NULL,
  huella TEXT NOT NULL, cobro_id INTEGER, gasto_id INTEGER, creado_en TEXT NOT NULL, UNIQUE (obligado_id, huella)
);
`},
];

export function migrar(db: SqlDriver, ahora = () => new Date()): number[] {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, nombre TEXT, aplicada_en TEXT NOT NULL)");
  const hechas = new Set(db.all<{ version: number }>("SELECT version FROM schema_migrations").map((r) => r.version));
  const aplicadas: number[] = [];
  for (const m of MIGRACIONES) {
    if (hechas.has(m.version)) continue;
    tx(db, () => {
      db.exec(m.sql);
      db.run("INSERT INTO schema_migrations (version, nombre, aplicada_en) VALUES (?, ?, ?)", [m.version, m.nombre, ahora().toISOString()]);
    });
    aplicadas.push(m.version);
  }
  return aplicadas;
}
export const versionEsquema = (db: SqlDriver) => db.get<{ v: number }>("SELECT MAX(version) AS v FROM schema_migrations")?.v ?? 0;
