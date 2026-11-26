# Publicar una versión

```bash
node scripts/version.mjs 0.4.0          # misma versión en package.json, Cargo.toml, tauri.conf.json y SistemaInformatico
git commit -am "Versión 0.4.0"
git tag v0.4.0 && git push --follow-tags
```

El workflow [`release.yml`](../.github/workflows/release.yml) crea un **borrador** con el changelog
(`scripts/changelog.mjs`), compila todo en paralelo y, si todo va bien, calcula `SHA256SUMS.txt`, añade
copias con **nombre estable** (para los enlaces `releases/latest/download/…` del README) y publica.
Si algún trabajo falla, la versión se queda en borrador.

| Trabajo | Resultado |
|---|---|
| Escritorio · Linux | `.AppImage`, `.deb`, `.rpm` (x86_64) |
| Escritorio · Windows | `.msi` (es-ES y en-US), `-setup.exe` (NSIS, por usuario), `_portable.zip` |
| Escritorio · macOS | `.dmg` universal (Apple Silicon + Intel) |
| Android | `.apk` universal firmado y `.aab` (Google Play) |
| Docker | `ghcr.io/astrosoftwaremoon/astrofact-server:{versión, X.Y, latest}` para `linux/amd64` y `linux/arm64`, con SBOM y procedencia |
| PWA | `_pwa.zip` (sirve con cualquier servidor estático) y, opcionalmente, GitHub Pages |
| iOS | Workflow manual [`ios.yml`](../.github/workflows/ios.yml): requiere cuenta de Apple Developer |

## Funciona sin secretos

Sin configurar nada, se publican binarios **sin firmar**:
- **Windows**: SmartScreen puede mostrar «Windows protegió su PC» → *Más información* → *Ejecutar de todas formas*.
- **macOS**: la primera vez, clic derecho → *Abrir* (o `xattr -dr com.apple.quarantine /Applications/AstroFact.app`).
- **Android**: el APK se firma con una **clave efímera** generada en la CI. Funciona, pero cada versión tiene una clave distinta: para actualizar hay que desinstalar antes (exporta tus registros y copia de seguridad).
- **Autoactualización**: desactivada (la app lo indica en *Ajustes → Actualizaciones*).

## Secretos y variables opcionales (Settings → Secrets and variables → Actions)

| Nombre | Tipo | Para qué |
|---|---|---|
| `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | secreto | Firmar las actualizaciones. Genera el par con `pnpm --filter @astrofact/client tauri signer generate -w astrofact.key` |
| `TAURI_UPDATER_PUBKEY` | **variable** (es pública) | Clave pública del par anterior; se inyecta en `tauri.conf.json` al compilar |
| `APPLE_CERTIFICATE` (p12 en base64), `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_ID`, `APPLE_PASSWORD` (contraseña de app), `APPLE_TEAM_ID` | secretos | Firmar y notarizar en macOS (Apple Developer, 99 €/año) |
| `ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | secretos | Firma estable de Android. `keytool -genkeypair -keystore astrofact.jks -alias astrofact -keyalg RSA -keysize 3072 -validity 10000` y `base64 -w0 astrofact.jks` |
| `PRODUCTOR_NOMBRE`, `PRODUCTOR_NIF`, `PRODUCTOR_DIRECCION`, `PRODUCTOR_FECHA`, `PRODUCTOR_LUGAR`, `PRODUCTOR_CONTACTO` | variables | Datos de la **declaración responsable** de la versión (art. 15 Orden HAC/1177/2024). Sin ellos la app muestra la declaración como pendiente: no distribuyas así a usuarios reales. Ver [cumplimiento/README.md](cumplimiento/README.md) |
| `PUBLICAR_PWA` = `true` | variable | Publicar la PWA en GitHub Pages (activa Pages con origen «GitHub Actions») |
| `IOS_HABILITADO` = `true` + `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_P8_B64`, `APPLE_DEVELOPMENT_TEAM` | variable + secretos | Habilitar el workflow de iOS |

> **Guarda la clave privada del actualizador y el keystore de Android fuera del repositorio** y con copia
> de seguridad: si se pierden, las instalaciones existentes no podrán actualizarse.
> Windows: la firma de código (Authenticode / Azure Trusted Signing) queda como mejora futura.

## Verificar una descarga

```bash
sha256sum -c SHA256SUMS.txt --ignore-missing
```

## Autoactualización

Solo en escritorio y solo si el usuario lo permite (*Ajustes → Actualizaciones*, activado por defecto,
se puede desactivar). La app consulta `releases/latest/download/latest.json` en GitHub, descarga el
paquete y **verifica su firma minisign** con la clave pública incluida en la app antes de instalarlo.
No se envía ningún dato del usuario.
