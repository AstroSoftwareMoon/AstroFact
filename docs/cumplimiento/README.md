# Cumplimiento normativo de AstroFact

Esta carpeta reúne lo necesario para que **quien distribuya** una versión de AstroFact (la «persona o
entidad productora» del art. 3 RD 1007/2023) pueda suscribir la declaración responsable y justificar
el cumplimiento. AstroFact **no está certificado ni homologado por la AEAT**: esa figura no existe para
estos sistemas; lo que existe es la declaración responsable del productor (art. 15 Orden HAC/1177/2024).

| Documento | Para qué |
|---|---|
| [`declaracion-responsable.md`](declaracion-responsable.md) | Plantilla con los apartados a)–l) en el orden del art. 15.1 |
| [`matriz.md`](matriz.md) | Requisito → norma → módulo del código → test que lo comprueba |
| [`../requisitos.md`](../requisitos.md) | Resumen de los requisitos con cita a la norma |
| [`../normativa/README.md`](../normativa/README.md) | Documentos oficiales usados, versión, fecha de descarga y SHA-256 |
| [`../TODO-normativa.md`](../TODO-normativa.md) | Dudas abiertas y decisiones provisionales (no se ha inventado nada) |

## 1. Datos del productor en la compilación

La app muestra la declaración responsable en **Cumplimiento** (art. 15.3: debe estar disponible en el propio
sistema). Los datos del productor **no se escriben en el código**: se fijan al compilar.

- **Releases de GitHub**: en *Settings → Secrets and variables → Actions → Variables* del repositorio crea
  `PRODUCTOR_NOMBRE`, `PRODUCTOR_NIF`, `PRODUCTOR_DIRECCION`, `PRODUCTOR_FECHA` (DD-MM-AAAA),
  `PRODUCTOR_LUGAR` (Localidad, País) y, si quieres, `PRODUCTOR_CONTACTO`. El workflow `release.yml` los
  pasa a la app de escritorio, móvil, PWA e imagen Docker.
- **Compilación local**: exporta `VITE_PRODUCTOR_NOMBRE`, `VITE_PRODUCTOR_NIF`, … antes de `vite build`.
- **Servidor**: `ASTROFACT_PRODUCTOR_NOMBRE` y `ASTROFACT_PRODUCTOR_NIF` fijan el productor en el bloque
  `SistemaInformatico` de los registros generados por el servidor.

Si faltan, la app indica que la declaración está **pendiente de suscribir** y los registros usan el
productor provisional del proyecto ([TODO #9](../TODO-normativa.md)). **No distribuyas a usuarios reales una
compilación sin declaración responsable.**

## 2. Antes de publicar una versión

1. Todos los tests en verde (`pnpm test`, E2E local y de servidor) y validación contra los XSD oficiales en CI.
2. `pnpm normativa:fetch`: comprueba que la documentación oficial no ha cambiado (compara SHA-256). Si cambió,
   revisa las diferencias antes de publicar y actualiza `docs/normativa/README.md`.
3. Pruebas contra el **entorno de pruebas de la AEAT** con un certificado de pruebas (VERI\*FACTU), nunca con
   datos reales ([VERIFACTU.md](../VERIFACTU.md)). El simulador del repositorio **no** sustituye a esa prueba.
4. Revisa [`TODO-normativa.md`](../TODO-normativa.md): ningún punto abierto debe afectar a la versión.
5. Completa y firma la declaración responsable de **esa versión concreta** (apartado c).

## 3. Qué hace el sistema para cumplir (resumen)

- **Integridad e inalterabilidad**: los registros de alta/anulación y los eventos no se pueden modificar ni
  borrar (triggers en la base de datos); huella SHA-256 encadenada; firma XAdES-EPES en No VERI\*FACTU.
- **Trazabilidad**: encadenamiento y verificación con alarma persistente; las copias de seguridad no pueden
  restaurarse si harían perder registros o romperían la cadena; la restauración se registra (evento 07).
- **Conservación y exportación**: exportación por periodos con el XSD oficial, anotada como evento.
- **Registro de eventos** (No VERI\*FACTU): inicio/fin, detección de anomalías, exportación, restauración y
  resumen cada 6 h.
- **VERI\*FACTU**: remisión con certificado, control de flujo, gestión de respuestas y subsanación conforme a
  los cuadros oficiales.
- **Factura**: QR conforme a la especificación y leyenda VERI\*FACTU cuando corresponde.
