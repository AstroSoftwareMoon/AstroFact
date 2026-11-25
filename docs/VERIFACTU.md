# VERI*FACTU en AstroFact

> AstroFact no está «certificado» ni «homologado» por la AEAT (no existe tal cosa). Antes de cualquier uso
> real, prueba en el **entorno de pruebas** de la AEAT. Nunca envíes datos reales durante el desarrollo.

## Dónde funciona

| Modo | VERI*FACTU | Motivo |
|---|---|---|
| **Servidor** (Docker) | ✅ envío automático en segundo plano | El servidor abre la conexión TLS con tu certificado |
| **App de escritorio** (Tauri: Windows, macOS, Linux) | ✅ mientras la app está abierta | El núcleo en Rust abre la conexión TLS con tu certificado (`aeat_enviar`, solo hosts oficiales de la AEAT) |
| App Android/iOS en local | ⏳ pendiente (usa el modo servidor) | Falta el TLS con certificado de cliente en móvil |
| Navegador / PWA en local | ❌ (No VERI*FACTU sí) | Un navegador no puede presentar un certificado de cliente desde JavaScript |

## Cómo funciona

1. **Emisión** → registro de alta encadenado (huella SHA-256). En VERI*FACTU no se firma (art. 3 Orden) y queda **pendiente** en la cola.
2. **Envío** (`packages/db/src/verifactu.ts`): lotes de hasta 1000 registros en orden de la cadena, mensaje `RegFactuSistemaFacturacion` (validado contra el XSD oficial en los tests), HTTPS con certificado de cliente.
3. **Control de flujo** (art. 16.2): espera el `TiempoEsperaEnvio` que devuelve la AEAT (60 s al inicio) o hasta acumular 1000 registros.
4. **Respuesta**: cada registro queda `aceptado`, `aceptado_con_errores` o `rechazado` con el **código y texto oficiales** (`errores.properties`) y el CSV del envío. Errores de conexión y `SOAP Fault` del servidor → la cola se reintenta con backoff (30 s → 30 min). `SOAP Fault` de cliente (esquema) → rechazo y alarma.
5. **Duplicados**: si la AEAT responde 3000 (duplicado) indicando que ya tenía el registro como correcto (respuesta anterior perdida), se marca como aceptado.

### Subsanación y anulación (cuadros oficiales A y B de `DsRegistroVeriFactu.xlsx`)

| Situación | Operación | Marcas |
|---|---|---|
| Alta rechazada (no existe en la AEAT) | **Alta por rechazo** | `Subsanacion=S`, `RechazoPrevio=X` |
| Alta aceptada con errores | **Alta de subsanación** | `Subsanacion=S` |
| Subsanación rechazada (el original sí existe) | **Alta por rechazo de subsanación** | `Subsanacion=S`, `RechazoPrevio=S` |
| Anular una factura registrada en la AEAT | **Anulación** | — |
| Anular una factura cuyo alta nunca llegó | **Anulación sin registro previo** | `SinRegistroPrevio=S` |

El botón **Subsanar** (factura o *Envíos AEAT*) genera un nuevo registro con los mismos datos de la factura,
encadenado, y lo pone en cola. Si cambian importes u otros datos de la factura, lo que procede es una
**factura rectificativa**, no una subsanación.

## Probar sin certificado: simulador

`packages/aeat-sim` reproduce el servicio (formato SOAP, validación XSD, cuadro de operativa, varias
validaciones de negocio con sus códigos oficiales, huella, duplicados, TLS con certificado de cliente).
**No es la AEAT** y la interfaz lo indica cuando el servidor lo usa.

```bash
pnpm --filter @astrofact/aeat-sim start            # http://localhost:8443/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP
ASTROFACT_AEAT_URL=http://localhost:8443/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP pnpm --filter @astrofact/server dev
pnpm --filter @astrofact/client e2e:servidor       # recorrido completo en el navegador
```

## Probar contra el entorno de pruebas de la AEAT

1. Configura el negocio con **entorno: Pruebas** (el QR apunta a `prewww2.aeat.es` y las facturas salen marcadas «PRUEBAS»).
2. Carga un certificado electrónico válido ante la AEAT (el tuyo o el de tu representante).
   TODO(normativa #12): confirmar con la AEAT qué certificados de prueba admite el portal de pruebas externas.
3. Emite facturas de prueba y revisa *Envíos AEAT*. Endpoint usado: `https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP`.

**Producción** solo se usa si el negocio está en entorno *Producción* y, en el servidor, además
`ASTROFACT_PERMITIR_PRODUCCION=1` (doble seguro contra envíos reales por error).

## Pendiente (documentado, sin inventar)

- `Incidencia=S` en la cabecera para registros generados durante una caída (TODO normativa #5).
- Renuncia a VERI*FACTU con efectos a final de año (`FechaFinVeriFactu`, art. 17) (TODO #11).
- Consulta de registros enviados (`ConsultaFactuSistemaFacturacion`) y remisión por requerimiento en No VERI*FACTU.
