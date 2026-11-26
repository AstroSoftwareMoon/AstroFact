# Seguridad

## Informar de una vulnerabilidad

No abras un issue público. Usa **Security → Report a vulnerability** (aviso privado de GitHub) en este
repositorio con una descripción, los pasos para reproducirla y su impacto. Responderemos en cuanto sea
posible y coordinaremos la publicación del arreglo.

Interesa especialmente cualquier fallo que permita:
- alterar, borrar o reordenar registros de facturación o de eventos sin que la verificación lo detecte;
- obtener el certificado electrónico, su contraseña o los datos de otra persona;
- saltarse los roles o la lista blanca de operaciones del servidor;
- enviar a la AEAT registros que el usuario no ha emitido.

## Diseño

- Cero telemetría: la app solo se conecta a la AEAT (VERI\*FACTU), a tu servidor (si lo usas) y, si está
  activado, al servicio de actualizaciones de GitHub.
- Datos locales cifrables (PBKDF2-SHA-256 + AES-256-GCM); copias `.astro` cifradas con contraseña propia.
- Servidor: argon2id, 2FA TOTP, roles, rate limiting, auditoría, CSP estricta y réplica de solo lectura sin
  secretos para los clientes. Detalles en [docs/SERVIDOR.md](docs/SERVIDOR.md).
- Conexión con la AEAT restringida a sus dominios oficiales, con certificado de cliente.
