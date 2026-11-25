# Servidor autohospedado

Un servidor AstroFact es **tuyo**: datos en tu máquina, sin telemetría. Varios usuarios con roles,
verificación en dos pasos y envío automático VERI*FACTU.

```bash
docker compose -f apps/server/docker-compose.yml up -d   # http://localhost:8080
```

Al abrirlo por primera vez se crea la cuenta **propietaria**. Ponlo siempre detrás de **HTTPS**, p. ej. con Caddy:

```
facturas.miempresa.es {
  reverse_proxy astrofact:8080
}
```

## Variables de entorno

| Variable | Por defecto | Uso |
|---|---|---|
| `PORT` | `8080` | Puerto |
| `ASTROFACT_DATA_DIR` | `/data` | Base de datos SQLite (`astrofact.db`) y `secret.key` |
| `ASTROFACT_SECRET` | (se genera `secret.key`) | Clave maestra (≥ 32 caracteres) que cifra los secretos TOTP y la contraseña recordada del certificado |
| `ASTROFACT_ORIGENES` | orígenes de Tauri | Orígenes CORS permitidos para la app de escritorio/móvil |
| `ASTROFACT_PERMITIR_PRODUCCION` | — | `1` para permitir envíos a la AEAT de **producción** |
| `ASTROFACT_AEAT_URL`, `ASTROFACT_AEAT_CA` | — | Solo desarrollo: URL y CA del simulador |

## Seguridad

- Contraseñas con **argon2id**; mensajes de error genéricos en el inicio de sesión; sesiones con token aleatorio (se guarda solo su SHA-256) y caducidad deslizante de 12 h.
- **2FA TOTP** (RFC 6238) opcional por usuario; secreto cifrado con AES-256-GCM.
- **Roles**: propietario (todo), contable (facturar, clientes, productos, exportar), solo lectura.
- **Rate limiting** global y estricto en inicio de sesión e instalación. **Auditoría** de accesos y operaciones.
- Cabeceras CSP estrictas, `nosniff`, `no-referrer`, `frame-ancestors 'none'`.
- Las operaciones se ejecutan en el servidor mediante una **lista blanca** de métodos con rol mínimo.
  Los clientes reciben una **réplica de solo lectura** de la base de datos **sin** usuarios, sesiones,
  secretos ni certificados, y leen de ella con el mismo código que en modo local.
- El certificado se guarda cifrado con su propia contraseña. Si el propietario marca «recordar», esa
  contraseña se guarda cifrada con la clave maestra para poder enviar a la AEAT sin intervención.
  **Protege `secret.key`** (o `ASTROFACT_SECRET`) y haz copias de `/data`.

## Limitaciones actuales

- Un negocio (obligado tributario) por servidor en la interfaz.
- Base de datos SQLite (modo WAL). PostgreSQL queda pendiente: la capa de datos es síncrona y requiere un adaptador asíncrono.
