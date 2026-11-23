# Normativa y documentación técnica oficial

AstroFact se basa **únicamente** en la normativa y documentación publicada por el BOE y la
Agencia Estatal de Administración Tributaria (AEAT). Esta carpeta recoge las fuentes
utilizadas, su versión y su huella SHA-256 en el momento de la descarga (**22/11/2026**).

> Para volver a descargarlas y comprobar si han cambiado: `pnpm normativa:fetch`
> (script `scripts/fetch-normativa.sh`). Si un hash cambia, hay una nueva versión: revisa el
> control de cambios del documento y actualiza código, tests y esta tabla.

## Normas (BOE)

| Norma | Versión consultada | Enlace |
|---|---|---|
| Real Decreto 1007/2023, de 5 de diciembre — Reglamento de requisitos de los sistemas informáticos de facturación (RRSIF) | Texto consolidado, última modificación 03/12/2025 | https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840 |
| Orden HAC/1177/2024, de 17 de octubre — especificaciones técnicas, funcionales y de contenido | Texto consolidado, sin modificaciones | https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138 |
| Real Decreto 1619/2012 — Reglamento de obligaciones de facturación | (referencia) | https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696 |

**Fechas de obligatoriedad** (Disposición final cuarta del RD 1007/2023 consolidado):
contribuyentes del Impuesto sobre Sociedades antes del **1/1/2027**; resto de obligados antes del
**1/7/2027**. En AstroFact son **configurables** (`FECHAS_OBLIGATORIEDAD_DEFECTO`) porque se han
modificado varias veces: revísalas siempre en el BOE.

## Documentación técnica AEAT (Portal de desarrolladores)

Índice: https://www.agenciatributaria.es/AEAT.desarrolladores/Desarrolladores/_menu_/Documentacion/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU/Sistemas_Informaticos_de_Facturacion_y_Sistemas_VERI_FACTU.html

Base de descarga: `https://www.agenciatributaria.es/static_files/AEAT_Desarrolladores/EEDD/IVA/VERI-FACTU/`

| Documento | Versión / fecha | Uso en AstroFact | SHA-256 |
|---|---|---|---|
| Especificaciones técnicas de la huella o hash (`Veri-Factu_especificaciones_huella_hash_registros.pdf`) | v0.1.2 · 27/08/2024 | `fiscal-core/src/hash.ts`, vectores en `test/hash.test.ts` | `f4334c254bb8…` |
| Especificaciones del código QR (`DetalleEspecificacTecnCodigoQRfactura.pdf`) | v0.5.0 · 10/12/2025 | `src/qr.ts`, `test/qr.test.ts` | `f86b3c260d8a…` |
| Especificaciones de la firma electrónica (`Espec-Tecnicas/EspecTecGenerFirmaElectRfact.pdf`) | v0.1.5 · 06/03/2025 | `src/signature.ts` | `60953acd5d43…` |
| Ejemplos de firma (`Espec-Tecnicas/AnexosEjemplosFirmaRegFact.zip`) | — | `ejemplos/`, `test/firma-oficial.test.ts` | `66fac533bef6…` |
| Descripción del servicio web (`Veri-Factu_Descripcion_SWeb.pdf`) | v1.0.3 · 28/07/2025 | `src/aeat/*` | `b3570f6a308c…` |
| Validaciones y errores (`Validaciones_Errores_Veri-Factu.pdf`) | v1.2.2 | `src/invoice/validate.ts` | `426eb926fc09…` |
| Diseño de registros y listas (`DsRegistroVeriFactu.xlsx`, copia aquí) | v1.0 · 28/10/2024 | `src/constants.ts`, `src/records/*` | `40ce191aa1de…` |
| FAQ desarrolladores (`FAQs-Desarrolladores.pdf`) | 04/12/2025 | IRPF fuera de ImporteTotal | `73906dc8afbb…` |
| Ejemplos de declaración responsable (`EjemplosDeclaracionResponsable.pdf`) | — | `docs/cumplimiento/declaracion-responsable.md` | `1b8ce1de0593…` |
| Servicio de validación No VERI*FACTU (`Descripcion_ServicioWeb_ValidacionNoVerifactu.pdf`) | — | fase 5 | `747a9ce4fad2…` |

Hashes completos en [`SHA256SUMS`](./SHA256SUMS).

## Esquemas (copia local en `xsd/`)

Origen: `https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/`

`SuministroLR.xsd`, `SuministroInformacion.xsd`, `RespuestaSuministro.xsd`, `ConsultaLR.xsd`,
`RespuestaConsultaLR.xsd`, `EventosSIF.xsd`, `RespuestaValRegistNoVeriFactu.xsd`, `SistemaFacturacion.wsdl`.

**Única modificación local:** en `SuministroInformacion.xsd` y `EventosSIF.xsd` el atributo
`schemaLocation` del `import` de XMLDSig apunta a la copia local `xmldsig-core-schema.xsd`
(W3C, licencia W3C Software) en lugar de `http://www.w3.org/TR/xmldsig-core/xmldsig-core-schema.xsd`,
para poder validar sin red en CI. Los hashes de `SHA256SUMS` son los de los ficheros **originales**.

## Endpoints

Del WSDL oficial: pruebas `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`
(certificado de sello: `prewww10`); producción `https://www1.agenciatributaria.gob.es/...` (`www10`).
**En desarrollo solo se usa el entorno de pruebas y nunca datos reales.**

## Puntos abiertos (TODO — pendiente de confirmar, no se ha inventado nada)

Ver [`../TODO-normativa.md`](../TODO-normativa.md).
