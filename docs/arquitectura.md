# Arquitectura de AstroFact

## Principios
1. **El usuario es dueño de sus datos.** No hay nube gestionada por el proyecto. Cero telemetría.
2. **Un único núcleo fiscal** (`@astrofact/fiscal-core`), puro, sin UI ni E/S, 100 % testeable y usado igual en cliente, servidor y PWA.
3. **Mismo código y misma interfaz** en modo LOCAL y AUTOHOSPEDADO: solo cambia el adaptador de datos.
4. **Inmutabilidad**: lo emitido no se edita ni se borra; solo se añaden registros (rectificativas, anulaciones, subsanaciones).

## Modos de uso

```
 MODO LOCAL (sin cuenta)                       MODO AUTOHOSPEDADO (Docker)
┌───────────────────────────────┐             ┌──────────────────────────────┐
│ apps/client (Tauri 2)         │             │ apps/client / apps/web (PWA) │
│  React + packages/ui          │             │  React + packages/ui         │
│  ├─ fiscal-core               │             │  └─ RemoteAdapter ──HTTPS──┐ │
│  └─ LocalAdapter              │             └────────────────────────────│─┘
│      └─ SQLite (SQLCipher opc)│                                          ▼
│  Firma: PKCS#12 / almacén SO  │             ┌──────────────────────────────┐
│  VERI*FACTU opcional (Rust    │             │ apps/server (Fastify + Zod)  │
│  hace el mTLS con la AEAT)    │             │  ├─ fiscal-core              │
└───────────────┬───────────────┘             │  ├─ cola de envíos + flujo   │
                │ SOAP + certificado          │  ├─ SQLite | PostgreSQL      │
                ▼                             │  ├─ argon2, 2FA, roles       │
        AEAT (prewww1 / www1)  ◀──────────────│  └─ backups programados      │
                                              └──────────────────────────────┘
```

## Árbol del monorepo (objetivo; ✅ = existe ya)

```
astrofact/
├─ apps/
│  ├─ client/            Tauri 2 (Windows, macOS, Linux, Android; iOS preparado)
│  │  ├─ src/            React + TS + Tailwind (pantallas)
│  │  └─ src-tauri/      Rust: SQLite, almacén de certificados del SO, cliente mTLS AEAT, updater
│  ├─ server/            Fastify + Zod + migraciones; Dockerfile multi-arch
│  └─ web/               PWA (mismo front que client, con RemoteAdapter)
├─ packages/
│  ├─ fiscal-core/   ✅  registros, huella, cadena, QR, firma XAdES, SOAP, validaciones
│  ├─ db/                esquema, migraciones versionadas, LocalAdapter / RemoteAdapter
│  ├─ pdf/               plantillas de factura (QR posicionado según spec)
│  ├─ facturae/          exportación Facturae 3.2.x (desactivado por defecto)
│  └─ ui/                componentes "liquid glass" (tema AstroTune), iconos
├─ branding/             logo SVG (negro/blanco), iconos de plataforma
├─ docs/             ✅  normativa, requisitos, cumplimiento, arquitectura
├─ scripts/          ✅  fetch-normativa.sh
└─ .github/workflows/    ci.yml ✅, release.yml (fase 4)
```

## Capa de datos

`DataAdapter` (interfaz única) con dos implementaciones:
- **LocalAdapter**: SQLite embebido (vía Tauri/Rust; `sqlite-wasm` + OPFS en la PWA local). Cifrado opcional (SQLCipher) con clave derivada por Argon2id de la contraseña del usuario.
- **RemoteAdapter**: cliente HTTP del servidor propio (Zod comparte los esquemas).

La **emisión** es una transacción atómica: reservar número de serie → construir registro (fiscal-core) → comprobar `comprobarAntesDeGenerar` → firmar (No VERI*FACTU) → insertar factura + registro + evento → encolar envío (VERI*FACTU). Si cualquier paso falla, no se consume número.

## Esquema de base de datos (v1)

```sql
-- Configuración y obligados
CREATE TABLE obligado (            -- empresa/autónomo emisor (multi-OT)
  id INTEGER PRIMARY KEY, nif TEXT NOT NULL UNIQUE, nombre TEXT NOT NULL,
  direccion_json TEXT, territorio TEXT NOT NULL DEFAULT 'peninsula', -- huso horario
  modo TEXT NOT NULL CHECK (modo IN ('verifactu','no_verifactu')),
  entorno_aeat TEXT NOT NULL DEFAULT 'pruebas', fecha_fin_verifactu TEXT,
  creado_en TEXT NOT NULL
);
CREATE TABLE instalacion (         -- bloque SistemaInformatico
  id INTEGER PRIMARY KEY, numero_instalacion TEXT NOT NULL UNIQUE, version TEXT NOT NULL, creado_en TEXT NOT NULL
);
CREATE TABLE certificado (         -- metadatos; la clave privada NUNCA en claro
  id INTEGER PRIMARY KEY, obligado_id INTEGER REFERENCES obligado(id),
  titular TEXT, nif TEXT, valido_desde TEXT, valido_hasta TEXT,
  origen TEXT CHECK (origen IN ('pkcs12_cifrado','almacen_so')), blob_cifrado BLOB, huella_sha256 TEXT
);
CREATE TABLE serie (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL REFERENCES obligado(id),
  codigo TEXT NOT NULL, plantilla TEXT NOT NULL, tipo TEXT NOT NULL, -- ordinaria|rectificativa|simplificada
  reinicio_anual INTEGER NOT NULL DEFAULT 1, ultimo_numero INTEGER NOT NULL DEFAULT 0,
  ultima_fecha TEXT, anio INTEGER, activa INTEGER NOT NULL DEFAULT 1,
  UNIQUE (obligado_id, codigo)
);
-- Maestros
CREATE TABLE tercero (             -- clientes y proveedores
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, tipo TEXT NOT NULL, -- cliente|proveedor|ambos
  nombre TEXT NOT NULL, nif TEXT, id_otro_json TEXT, direccion_json TEXT, email TEXT, telefono TEXT,
  forma_pago TEXT, iban TEXT, recargo_equivalencia INTEGER DEFAULT 0, retencion_pct TEXT,
  anonimizado_en TEXT, creado_en TEXT NOT NULL, actualizado_en TEXT NOT NULL
);
CREATE TABLE producto (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, codigo TEXT, nombre TEXT NOT NULL,
  precio TEXT NOT NULL, impuesto TEXT DEFAULT '01', tipo TEXT, calificacion TEXT, exenta TEXT,
  tarifa_id INTEGER, activo INTEGER DEFAULT 1
);
CREATE TABLE tarifa (id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, nombre TEXT NOT NULL, ajuste_pct TEXT);
-- Documentos comerciales (editables hasta convertirse)
CREATE TABLE documento (           -- presupuestos y albaranes
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, clase TEXT CHECK (clase IN ('presupuesto','albaran')),
  numero TEXT, fecha TEXT, tercero_id INTEGER, estado TEXT, lineas_json TEXT NOT NULL, factura_id INTEGER
);
-- Facturas emitidas: INMUTABLES tras emitirse (trigger impide UPDATE/DELETE de campos fiscales)
CREATE TABLE factura (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, serie_id INTEGER NOT NULL, numero INTEGER NOT NULL,
  num_serie TEXT NOT NULL, fecha_expedicion TEXT NOT NULL, fecha_operacion TEXT,
  tipo_factura TEXT NOT NULL, tipo_rectificativa TEXT, tercero_id INTEGER,
  datos_json TEXT NOT NULL,        -- FacturaBorrador completo congelado
  base_total TEXT NOT NULL, cuota_total TEXT NOT NULL, importe_total TEXT NOT NULL,
  retencion TEXT NOT NULL DEFAULT '0', total_a_pagar TEXT NOT NULL,
  estado_cobro TEXT NOT NULL DEFAULT 'pendiente', vencimiento TEXT,
  anulada INTEGER NOT NULL DEFAULT 0, rectificada_por INTEGER,
  emitida_en TEXT NOT NULL,
  UNIQUE (obligado_id, num_serie), UNIQUE (serie_id, numero, fecha_expedicion)
);
CREATE TABLE factura_linea (id INTEGER PRIMARY KEY, factura_id INTEGER NOT NULL, orden INTEGER, datos_json TEXT NOT NULL);
-- Registros de facturación: cadena append-only
CREATE TABLE registro_facturacion (
  id INTEGER PRIMARY KEY,          -- orden cronológico de generación = orden de la cadena
  obligado_id INTEGER NOT NULL, factura_id INTEGER, tipo TEXT CHECK (tipo IN ('alta','anulacion')),
  num_serie TEXT NOT NULL, fecha_expedicion TEXT NOT NULL, fecha_hora_gen TEXT NOT NULL,
  huella TEXT NOT NULL UNIQUE, huella_anterior TEXT, -- NULL solo en el primero
  xml TEXT NOT NULL,               -- XML exacto conservado (firmado en No VERI*FACTU)
  firmado INTEGER NOT NULL DEFAULT 0, subsanacion INTEGER DEFAULT 0,
  exportado_en TEXT, conservado INTEGER NOT NULL DEFAULT 1  -- art. 8.2: solo tras exportar, por los más antiguos
);
CREATE UNIQUE INDEX ux_cadena ON registro_facturacion(obligado_id, huella_anterior); -- impide bifurcaciones
-- Envíos VERI*FACTU
CREATE TABLE envio_aeat (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, creado_en TEXT, enviado_en TEXT,
  estado TEXT,                     -- pendiente|enviando|correcto|parcial|incorrecto|error_transporte
  csv TEXT, tiempo_espera INTEGER, intento INTEGER DEFAULT 0, proximo_intento TEXT,
  peticion_xml TEXT, respuesta_xml TEXT
);
CREATE TABLE envio_registro (
  envio_id INTEGER NOT NULL, registro_id INTEGER NOT NULL,
  estado TEXT,                     -- aceptado|aceptado_con_errores|rechazado
  codigo_error INTEGER, descripcion_error TEXT, PRIMARY KEY (envio_id, registro_id)
);
-- Eventos (art. 9) y auditoría
CREATE TABLE registro_evento (
  id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, tipo TEXT NOT NULL, fecha_hora_gen TEXT NOT NULL,
  huella TEXT NOT NULL UNIQUE, huella_anterior TEXT, xml TEXT NOT NULL, exportado_en TEXT
);
CREATE TABLE auditoria (            -- diario técnico encadenado (arranques, config, login, errores)
  id INTEGER PRIMARY KEY, ts TEXT NOT NULL, usuario_id INTEGER, accion TEXT NOT NULL,
  detalle_json TEXT, huella TEXT NOT NULL, huella_anterior TEXT
);
-- Gastos y cobros
CREATE TABLE gasto (id INTEGER PRIMARY KEY, obligado_id INTEGER NOT NULL, proveedor_id INTEGER, fecha TEXT,
  numero TEXT, base TEXT, cuota TEXT, retencion TEXT, total TEXT, categoria TEXT, deducible INTEGER DEFAULT 1,
  estado_pago TEXT DEFAULT 'pendiente');
CREATE TABLE adjunto (id INTEGER PRIMARY KEY, entidad TEXT, entidad_id INTEGER, nombre TEXT, mime TEXT, sha256 TEXT, ruta TEXT);
CREATE TABLE movimiento (id INTEGER PRIMARY KEY, obligado_id INTEGER, fecha TEXT, importe TEXT, concepto TEXT,
  factura_id INTEGER, gasto_id INTEGER);  -- conciliación simple
CREATE TABLE recurrencia (id INTEGER PRIMARY KEY, obligado_id INTEGER, plantilla_json TEXT, periodicidad TEXT, proxima TEXT, activa INTEGER);
-- Usuarios (modo servidor)
CREATE TABLE usuario (id INTEGER PRIMARY KEY, email TEXT UNIQUE, hash_argon2 TEXT NOT NULL, totp_secreto_cifrado TEXT,
  rol TEXT CHECK (rol IN ('propietario','contable','lectura')), activo INTEGER DEFAULT 1);
CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, aplicada_en TEXT NOT NULL);
```

**Garantías en BD**: triggers `BEFORE UPDATE/DELETE` sobre `registro_facturacion` y `registro_evento` que abortan (salvo el marcado de exportación/conservación del art. 8.2), y sobre los campos fiscales de `factura`. Un intento de manipulación detectado por `verificarCadena` genera evento 04/06 y alarma persistente.

## Seguridad
- Certificados: PKCS#12 cifrado con clave derivada (Argon2id) o almacén del sistema (Keychain, CNG, Secret Service, Android Keystore). La contraseña del P12 nunca se persiste.
- Servidor: argon2id, TOTP opcional, roles (propietario/contable/lectura), rate limiting, auditoría, CSP estricta.
- RGPD: exportación de datos del cliente; "borrado" = anonimización de datos no fiscales, conservando las facturas durante el plazo legal (la UI explica el conflicto, art. 17.3.b RGPD).

## Conservación y copias
- Copias `.astro` (ZIP cifrado: base de datos + adjuntos + manifiesto con hashes). Restaurar genera evento 07.
- Exportación de registros (art. 8.2) independiente de las copias, genera evento 08/09.
