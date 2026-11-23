# Matriz de cumplimiento: requisito → módulo → test

Estado: ✅ implementado y probado · 🟡 parcial (núcleo listo, falta UI/servidor) · ⏳ fase posterior.
Fase actual: **1 (fiscal-core)**. Los módulos de app/servidor se completarán en fases 2–7.

| Requisito | Norma | Módulo | Test | Estado |
|---|---|---|---|---|
| Registro de alta con estructura oficial | Orden 10; XSD | `fiscal-core/src/records/build.ts`, `records/xml.ts` | `records.test.ts` (validación XSD) | ✅ |
| Registro de anulación | Orden 11; XSD | `records/build.ts` | `records.test.ts` | ✅ |
| Huella SHA-256 de alta, anulación y evento | Orden 13; doc. huella v0.1.2 | `src/hash.ts` | `hash.test.ts` (3 vectores oficiales + ejemplo de firma) | ✅ |
| Encadenado único, altas y anulaciones | Orden 7.a–d | `records/build.ts` (`encadenamientoDesde`) | `records.test.ts` | ✅ |
| Fecha-hora-huso de generación | Orden 7.e–g | `src/dates.ts` | `dates.test.ts` | ✅ |
| Comprobación de huella individual | Orden 6.b | `recalcularHuella` | `chain.test.ts` | 🟡 (falta botón UI) |
| Comprobación de cadena total/parcial | Orden 6.e, 7.h | `src/chain.ts` (`verificarCadena`) | `chain.test.ts` | 🟡 (UI fase 2) |
| Navegación adelante/atrás con indicación | Orden 7.h | `chain.ts` (`saltar`) | `chain.test.ts` | 🟡 (UI fase 2) |
| Comprobación previa a generar | Orden 7.i | `chain.ts` (`comprobarAntesDeGenerar`) | `chain.test.ts` | ✅ |
| Clasificación de anomalías (L1E) | Orden 6.f; L1E | `chain.ts`, `events.ts` | `chain.test.ts`, `events.test.ts` | ✅ |
| Alarma persistente ante anomalía | Orden 6.f.1º | apps/client | — | ⏳ fase 2 |
| Firma XAdES-EPES de registros | Orden 6.c, 14; doc. firma v0.1.5 | `src/signature.ts` | `signature.test.ts`, `firma-oficial.test.ts` | ✅ |
| Verificación de firma | Orden 6.d | `verificarFirmaXml` | `firma-oficial.test.ts` (ejemplo oficial AEAT) | ✅ |
| Carga PKCS#12 | Orden 4.b | `cargarPkcs12` | `signature.test.ts` | ✅ (almacén del SO: fase 2) |
| Registro de eventos encadenado y firmado | Orden 9; EventosSIF.xsd | `src/events.ts`, `records/xml.ts` | `events.test.ts`, `signature.test.ts` (XSD) | ✅ |
| Resumen de eventos cada 6 h y al cerrar | Orden 9.2 | `events.ts` (`resumenPendiente`, `datosResumen`) | `events.test.ts` | 🟡 (planificador fase 2) |
| Exportación de registros por periodo | Orden 8.2, 8.5 | `src/export.ts` | `records.test.ts` (XSD) | 🟡 (UI + evento 08 fase 2) |
| Conservación sin huecos | Orden 8.2 | packages/db | — | ⏳ fase 2 |
| QR: URL, parámetros, encoding | Orden 21; doc. QR v0.5.0 §4–8 | `src/qr.ts` | `qr.test.ts` (ejemplos oficiales) | ✅ |
| QR: nivel M, 30–40 mm, margen, textos | Orden 20–21; doc. QR §2–3 | `qr.ts` (`QR_LAYOUT`, `svgQr`) | `qr.test.ts` | 🟡 (maquetación PDF fase 3) |
| Leyenda VERI*FACTU | Orden 20.1.b | `QR_LAYOUT.leyendaVerifactu` | `qr.test.ts` | 🟡 (PDF fase 3) |
| Envío SOAP RegFactuSistemaFacturacion | Orden 16; Descripción SW | `src/aeat/soap.ts` | `records.test.ts` (XSD SuministroLR) | 🟡 (transporte fase 5) |
| Control de flujo (60 s / 1000) | Orden 16.2 | `src/aeat/flow.ts` | `aeat.test.ts` | ✅ |
| Procesado de respuestas y SOAP Fault | Orden 4.d; Validaciones 4 | `src/aeat/response.ts` | `aeat.test.ts` | ✅ |
| Subsanación / rechazo previo | Descripción SW 9.1.2 | `construirRegistroAlta({subsanacion, rechazoPrevio})` | — | 🟡 fase 5 |
| Validaciones de negocio previas | Validaciones v1.2.2 §3.1.3 | `src/invoice/validate.ts` | `validate.test.ts` | ✅ |
| NIF/NIE/CIF y NIF-IVA UE | Validaciones nota (1) | `src/nif.ts` | `nif.test.ts` | ✅ |
| Numeración sin saltos ni duplicados, fechas coherentes | RD 1619/2012 art. 6 | `src/numbering.ts` | `numbering.test.ts` | 🟡 (bloqueo transaccional fase 2) |
| Cálculo IVA, RE, IRPF, S2, exentas, IGIC | LIVA; FAQ AEAT | `src/invoice/calc.ts` | `calc.test.ts` | ✅ |
| Aritmética exacta y redondeo | — | `src/decimal.ts` | `decimal.test.ts` | ✅ |
| Rectificativas S/I | RRSIF; L2/L3 | `records/build.ts`, `validate.ts` | `records.test.ts`, `validate.test.ts` | ✅ |
| Declaración responsable disponible en el sistema | Orden 15.3 | `docs/cumplimiento/declaracion-responsable.md` | — | 🟡 (pantalla en app fase 7) |
| No afirmar certificación/homologación | Encargo / Orden 15 | README, app | revisión | ✅ |
