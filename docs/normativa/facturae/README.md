# Facturae (formato de factura electrónica estructurada)

Fuente: https://www.facturae.gob.es/formato/Paginas/version-3-2.aspx (descargado el 26/11/2026).

| Documento | Uso | SHA-256 (original) |
|---|---|---|
| `Facturaev3_2_2.xml` → copia `Facturaev3_2_2.xsd` | Esquema 3.2.2 (validación en tests) | ver `SHA256SUMS` |
| `Esquema_castellano_v3_2_x_06_06_2017_unificado.pdf` | Descripción de campos | ver `SHA256SUMS` |
| `politica_de_firma_formato_facturae_v3_1.pdf` | Política de firma XAdES v3.1 | ver `SHA256SUMS` |
| `politica_firma_v3_1_sha1.txt` / `_sha2.txt` | Huellas **publicadas** de la política (para `SigPolicyHash`) | — |

Única modificación local: el `import` de XMLDSig apunta a `../xsd/xmldsig-core-schema.xsd` para validar sin red.

> Nota: las huellas publicadas en `politica_firma_v3_1_sha1.txt` no coinciden con la huella del PDF que se
> descarga hoy de la web (el PDF parece haberse re-maquetado). Las implementaciones usan la huella publicada.
> TODO(normativa #14): confirmar con el Ministerio cuál debe figurar en `SigPolicyHash`.
