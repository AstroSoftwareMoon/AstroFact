# Plantilla de declaración responsable

> ⚠️ **Plantilla.** Debe completarla y firmarla la **persona o entidad productora** que distribuya
> cada versión de AstroFact (art. 15 Orden HAC/1177/2024 y art. 13 RD 1007/2023). Este documento
> **no es una certificación ni una homologación de la AEAT**, que no existen para estos sistemas.
> Los apartados y su orden son los exigidos por el art. 15.1; los textos descriptivos que preceden a
> cada dato son obligatorios. Se ha seguido el documento de la AEAT `EjemplosDeclaracionResponsable.pdf`.

---

**DECLARACIÓN RESPONSABLE DEL SISTEMA INFORMÁTICO DE FACTURACIÓN**

a) Nombre del sistema informático a que se refiere la declaración responsable: **AstroFact**

b) Código identificador del sistema informático a que se refiere el apartado a): **AF** _(2 caracteres: mayúsculas sin Ñ o dígitos — confirmar)_

c) Identificador completo de la versión concreta del sistema informático: **[x.y.z]**

d) Componentes, hardware y software, de que consta el sistema informático, junto con una breve descripción de lo que hace y de sus principales funcionalidades: **AstroFact es un programa de facturación de código abierto compuesto por: (1) aplicación cliente multiplataforma (Windows, macOS, Linux, Android; Tauri 2) con base de datos local SQLite; (2) servidor autohospedable opcional (Node.js/Fastify en contenedor Docker, base de datos SQLite); (3) núcleo fiscal `@astrofact/fiscal-core`. Permite emitir facturas completas, simplificadas y rectificativas, genera los registros de facturación de alta y anulación encadenados con huella SHA-256, el código QR tributario, el registro de eventos y la firma electrónica XAdES de los registros en modalidad NO VERI*FACTU, y la remisión de registros a la AEAT en modalidad VERI*FACTU. No requiere hardware específico.**

e) Indicación de si el sistema informático se ha producido de tal manera que, a los efectos de cumplir con el Reglamento, solo pueda funcionar exclusivamente como «VERI*FACTU»: **No** (puede funcionar como VERI*FACTU y como NO VERI*FACTU).

f) Indicación de si el sistema informático permite ser usado por varios obligados tributarios o por un mismo usuario para dar soporte a la facturación de varios obligados tributarios: **Sí** _(confirmar según configuración distribuida)_

g) Tipos de firma utilizados para firmar los registros de facturación y de evento en el caso de que el sistema informático no sea utilizado como «VERI*FACTU»: **XAdES Enveloped Signature, clase EPES (ETSI EN 319 132), política de firma de la AGE, algoritmo RSA-SHA256.**

h) Nombre y apellidos de la persona o razón social de la entidad productora del sistema informático: **[PENDIENTE]**

i) Número de identificación fiscal (NIF) español de la persona o entidad productora: **[PENDIENTE]**

j) Dirección postal completa de contacto de la persona o entidad productora: **[PENDIENTE]**

k) La persona o entidad productora del sistema informático hace constar que dicho sistema informático, en la versión indicada en ella, cumple con lo dispuesto en el artículo 29.2.j) de la Ley 58/2003, de 17 de diciembre, General Tributaria, en el Reglamento que establece los requisitos que deben adoptar los sistemas y programas informáticos o electrónicos que soporten los procesos de facturación de empresarios y profesionales, y la estandarización de formatos de los registros de facturación, aprobado por el Real Decreto 1007/2023, de 5 de diciembre, en la Orden HAC/1177/2024, de 17 de octubre, y en la sede electrónica de la Agencia Estatal de Administración Tributaria para todo aquello que complete las especificaciones de dicha orden.

l) Fecha y lugar en los que la persona o entidad productora suscribe la declaración responsable: **[DD-MM-AAAA], [Localidad], [País]**

---

### Anexo (recomendado, art. 15.2)
- Otras formas de contacto: [email / web]
- Direcciones de Internet: https://github.com/AstroSoftwareMoon/AstroFact
- Explicación detallada del cumplimiento: ver [`matriz.md`](./matriz.md).
- Componentes de terceros: dependencias de código abierto listadas en `pnpm-lock.yaml`.
