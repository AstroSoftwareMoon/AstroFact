# Puntos abiertos de normativa (TODO)

Regla del proyecto: **si algo no está claro en la documentación oficial, no se inventa**: se
marca aquí, en el código con `TODO(normativa)` y se pregunta al responsable del proyecto.

| # | Cuestión | Dónde | Decisión provisional |
|---|---|---|---|
| 1 | Método de redondeo de la cuota (por línea o por tipo). Ni el RD 1619/2012 ni la Orden lo fijan. La AEAT tolera ±10 € (Validaciones §15.7). | `invoice/calc.ts` | Configurable; por defecto **por tipo** (half-up). |
| 2 | Contenedor XML de la **exportación** de registros (art. 8.2 Orden). La Orden exige estructura de arts. 10 y 11 pero no un fichero contenedor. | `export.ts` | Ficheros `RegFactuSistemaFacturacion` (≤1000 registros), válidos contra el XSD oficial. |
| 3 | Representación de un **resumen de eventos sin eventos** (art. 9.2): el XSD exige ≥1 `TipoEvento`. | `events.ts` | `TipoEvento=10` con `NumeroDeEventos=0`. Confirmar con la AEAT. |
| 4 | Política de **reintentos** ante errores de transporte: la AEAT solo fija el tiempo de espera entre envíos. | `aeat/flow.ts`, `db/verifactu.ts` | Backoff exponencial 30 s → 30 min, siempre respetando `TiempoEsperaEnvio`. Implementado. |
| 5 | Uso de `Incidencia=S` en la cabecera para registros generados durante una caída de conexión. | `aeat/soap.ts` (fase 5) | Pendiente de leer en detalle el apdo. correspondiente de la Descripción del SW antes de implementarlo. |
| 6 | Lista L10 del Excel v1.0 recoge E1–E6, mientras el XSD y Validaciones §15.5 admiten **E7/E8 solo para IGIC**. | `constants.ts` | Se siguen XSD + Validaciones; la app solo ofrece E7/E8 con IGIC. |
| 7 | El ejemplo oficial del documento de firma (v0.1.5) declara `CuotaTotal` 41.4 pero sus cuotas suman 31.4. | `test/calc.test.ts` | Calculamos 31.4 (correcto según §16 de Validaciones). Solo afecta al ejemplo, no al algoritmo. |
| 8 | Formato del **importe en la URL del QR**: la especificación indica `NNNNNNNN.DD` pero sus ejemplos usan `241.4`. | `qr.ts` | Siempre 2 decimales (`241.40`), conforme al formato declarado. |
| 9 | **Productor del SIF** (nombre, NIF, dirección) e `IdSistemaInformatico` definitivos para la declaración responsable y el bloque `SistemaInformatico`. | config | Se usan valores de prueba hasta que el responsable los facilite. **Pregunta abierta.** |
| 10 | Nombre definitivo del producto (el encargo dice "[NOMBRE]"). | todo el repo | **Resuelto**: el responsable confirmó **AstroFact**. |
| 11 | **Renuncia a VERI*FACTU** con efectos a final del año natural (`FechaFinVeriFactu`, art. 17 Orden). | `db/store.ts` | No implementado: solo se permite pasar de No VERI*FACTU a VERI*FACTU. |
| 12 | **Certificados de prueba** admitidos por el portal de pruebas externas de la AEAT. | docs/VERIFACTU.md | Sin confirmar; mientras, simulador propio (`packages/aeat-sim`). |
| 13 | Códigos de error del simulador: reproduce un subconjunto de validaciones con los códigos de `errores.properties`; las reglas exactas de la AEAT pueden diferir. | `packages/aeat-sim` | Se documenta que el simulador no es la AEAT. |
| 14 | **Firma Facturae** (XAdES con política Facturae v3.1): el hash publicado de la política no coincide con el del PDF descargado hoy (ver `docs/normativa/facturae/README.md`), y la política exige firmar también `KeyInfo`. | `packages/informes/src/facturae.ts` | Se exporta el XML **sin firmar** (válido contra el XSD oficial 3.2.2) para firmarlo con AutoFirma u otra herramienta. Módulo desactivado por defecto. |
| 15 | **Criterio de caja** (clave de régimen 07): el IVA se devenga al cobro, no a la expedición. | `packages/informes/src/iva.ts` | El resumen de IVA usa criterio de devengo y avisa; no se calcula el criterio de caja. |
| 16 | Facturae: separación de **nombre y apellidos** de personas físicas cuando solo se guarda el nombre completo; **código de motivo** de rectificación. | `facturae.ts` | Heurística (1.ª palabra = nombre, 2.ª = primer apellido) y motivo `16` por defecto; el usuario puede revisarlo antes de exportar. |
