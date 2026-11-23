# Resumen de requisitos (RD 1007/2023 + Orden HAC/1177/2024)

Fuentes y versiones en [`normativa/README.md`](normativa/README.md). Entre corchetes, el artículo.

## 1. Modalidades
- **VERI*FACTU** (sistema de emisión de facturas verificables): remite a la AEAT, en tiempo real y de forma automática, todos los registros de facturación. Se presumen cumplidos por diseño los arts. 6.b–f, 7.f, 7.h–j, 8 y 9 de la Orden [Orden 3]. No requiere firma de los registros.
- **No VERI*FACTU**: conserva los registros en el propio sistema, **firmados electrónicamente** (XAdES-EPES) [Orden 6.c, 14], con **registro de eventos** [Orden 9] y capacidad de remitirlos ante requerimiento [Orden 4].

## 2. Registros de facturación
- Por cada factura expedida se genera un **registro de alta**; para anularla, un **registro de anulación**. Nunca se modifican ni borran registros [RRSIF 8, 9; Orden 6].
- Formato XML UTF-8, estructura del anexo (XSD oficiales) [Orden 10, 11].
- Correcciones: factura rectificativa (sustitución «S» / diferencias «I») o, para errores de datos del registro sin necesidad de rectificativa, **alta de subsanación** (`Subsanacion=S`) [Descripción SW 9.1.2].

## 3. Integridad, trazabilidad y huella
- **Huella SHA-256** sobre campos concretos en formato `campo=valor&…`, hex mayúsculas [Orden 13; doc. huella v0.1.2].
- **Cadena única** por obligado y sistema, que incluye altas y anulaciones; cada registro contiene NIF, número y fecha de la factura del registro anterior y su huella [Orden 7.a–d].
- Fecha, hora y **huso horario** de generación; margen de reloj ≤ 1 minuto [Orden 7.e–g].
- Antes de generar: comprobar que el último registro está bien encadenado y no está más de 1 minuto en el futuro [Orden 7.i].
- Comprobación bajo demanda, rápida e intuitiva, de huella, firma y cadena (total o parcial); navegación adelante/atrás indicando si cada salto es correcto [Orden 6.b, 6.d, 6.e, 7.h].
- Ante cualquier anomalía: **alarma persistente** + registro de evento [Orden 6.f, 7.j].

## 4. Firma electrónica (No VERI*FACTU)
- XAdES Enveloped, clase EPES, política de firma AGE (OID 2.16.724.1.3.1.1.2.1.9), RSA ≥ 1024, SHA-256; certificado cualificado en vigor [Orden 14; doc. firma v0.1.5].

## 5. Registro de eventos (No VERI*FACTU)
- Eventos mínimos: inicio/fin como No VERI*FACTU, lanzamiento y detección de anomalías (facturación y eventos), restauración de copia, exportaciones [Orden 9.1; lista L2E].
- **Resumen de eventos** cada 6 horas de funcionamiento y antes de cerrar [Orden 9.2].
- Mismas garantías de integridad, encadenado, conservación y legibilidad; XML según EventosSIF.xsd [Orden 9.3–9.4].

## 6. Conservación y exportación (No VERI*FACTU)
- Conservar todos los registros, accesibles y legibles durante el plazo de conservación de las facturas [Orden 8.1, 8.3].
- Exportar como mínimo **todos los registros de un periodo**, copia fidedigna; solo tras exportar correctamente se pueden dejar de conservar, siempre por los más antiguos y sin huecos [Orden 8.2]. Independiente de las copias de seguridad.

## 7. Remisión VERI*FACTU
- Servicio web SOAP con certificado electrónico [Orden 4, 5, 16]; 1–1000 registros por envío.
- **Control de flujo**: esperar `t` segundos (inicial 60, actualizado en cada respuesta) o acumular 1000 registros [Orden 16.2].
- Respuestas por envío (Correcto / ParcialmenteCorrecto / Incorrecto) y por registro (Correcto / AceptadoConErrores / Incorrecto); los rechazados deben subsanarse [Validaciones 4].
- Renuncia a VERI*FACTU solo al final del año natural (`FechaFinVeriFactu`) [Orden 17].

## 8. Factura: representación gráfica
- **QR** de 30–40 mm, ISO/IEC 18004, corrección **M**, margen blanco ≥ 2 mm (recomendado 6), en la parte superior de la primera página, con el texto «QR tributario:» encima [Orden 20, 21; doc. QR v0.5.0].
- URL de cotejo con `nif`, `numserie`, `fecha`, `importe` (URL-encoded UTF-8); distinta para VERI*FACTU y No VERI*FACTU y para pruebas/producción.
- En VERI*FACTU, leyenda «Factura verificable en la sede electrónica de la AEAT» o «VERI*FACTU» bajo el QR.

## 9. Declaración responsable
- El **productor** suscribe una declaración responsable con contenido y orden fijados [Orden 15], disponible dentro del propio sistema. **No existe "certificación" ni "homologación" de la AEAT**: AstroFact nunca lo afirmará.

## 10. Otros requisitos de facturación (RD 1619/2012)
- Numeración correlativa por series, sin saltos; datos mínimos de factura completa y simplificada; rectificativas en serie específica; límites de la simplificada (400 € con carácter general, 3.000 € en los supuestos del art. 4); retenciones IRPF **fuera** del `ImporteTotal` del registro (FAQ AEAT).
