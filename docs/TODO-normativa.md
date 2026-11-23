# Puntos abiertos de normativa (TODO)

Regla del proyecto: **si algo no está claro en la documentación oficial, no se inventa**: se
marca aquí, en el código con `TODO(normativa)` y se pregunta al responsable del proyecto.

| # | Cuestión | Dónde | Decisión provisional |
|---|---|---|---|
| 1 | Método de redondeo de la cuota (por línea o por tipo). Ni el RD 1619/2012 ni la Orden lo fijan. La AEAT tolera ±10 € (Validaciones §15.7). | `invoice/calc.ts` | Configurable; por defecto **por tipo** (half-up). |
| 2 | Contenedor XML de la **exportación** de registros (art. 8.2 Orden). La Orden exige estructura de arts. 10 y 11 pero no un fichero contenedor. | `export.ts` | Ficheros `RegFactuSistemaFacturacion` (≤1000 registros), válidos contra el XSD oficial. |
| 3 | Representación de un **resumen de eventos sin eventos** (art. 9.2): el XSD exige ≥1 `TipoEvento`. | `events.ts` | `TipoEvento=10` con `NumeroDeEventos=0`. Confirmar con la AEAT. |
| 4 | Política de **reintentos** ante errores de transporte: la AEAT solo fija el tiempo de espera entre envíos. | `aeat/flow.ts` | Backoff exponencial 30 s → 30 min, siempre respetando `TiempoEsperaEnvio`. |
| 5 | Uso de `Incidencia=S` en la cabecera para registros generados durante una caída de conexión. | `aeat/soap.ts` (fase 5) | Pendiente de leer en detalle el apdo. correspondiente de la Descripción del SW antes de implementarlo. |
| 6 | Lista L10 del Excel v1.0 recoge E1–E6, mientras el XSD y Validaciones §15.5 admiten **E7/E8 solo para IGIC**. | `constants.ts` | Se siguen XSD + Validaciones; la app solo ofrece E7/E8 con IGIC. |
| 7 | El ejemplo oficial del documento de firma (v0.1.5) declara `CuotaTotal` 41.4 pero sus cuotas suman 31.4. | `test/calc.test.ts` | Calculamos 31.4 (correcto según §16 de Validaciones). Solo afecta al ejemplo, no al algoritmo. |
| 8 | Formato del **importe en la URL del QR**: la especificación indica `NNNNNNNN.DD` pero sus ejemplos usan `241.4`. | `qr.ts` | Siempre 2 decimales (`241.40`), conforme al formato declarado. |
| 9 | **Productor del SIF** (nombre, NIF, dirección) e `IdSistemaInformatico` definitivos para la declaración responsable y el bloque `SistemaInformatico`. | config | Se usan valores de prueba hasta que el responsable los facilite. **Pregunta abierta.** |
| 10 | Nombre definitivo del producto (el encargo dice "[NOMBRE]"). | todo el repo | Se usa **AstroFact** (nombre del repositorio). **Pregunta abierta.** |
