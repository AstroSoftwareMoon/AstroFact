# Contribuir a AstroFact

¡Gracias! Unas reglas que nos mantienen dentro de la ley:

1. **Solo documentación oficial.** Toda regla fiscal debe apoyarse en la normativa y la documentación de la
   sede de la AEAT descargadas en `docs/normativa` (con versión y huella). Cita el artículo o el apartado en
   el código. Si algo no está claro, **no lo inventes**: añádelo a `docs/TODO-normativa.md` y márcalo con
   `TODO(normativa #N)`.
2. **Nunca** escribas que AstroFact está «certificado» u «homologado» por la AEAT.
3. **Nunca** uses datos reales ni el entorno de producción de la AEAT en desarrollo o en tests.
4. Lo emitido no se toca: ningún cambio puede permitir editar o borrar registros de facturación o eventos.
5. Cada requisito nuevo lleva su test y su fila en `docs/cumplimiento/matriz.md`.

## Puesta en marcha

```bash
pnpm install
pnpm test                                # unitarios e integración
pnpm --filter @astrofact/client e2e      # E2E (Playwright)
pnpm --filter @astrofact/client dev      # app en el navegador
```

Estilo: TypeScript estricto, sin dependencias nuevas sin motivo, textos de la interfaz en español claro.
Las PR pasan por la CI (tipos, tests, XSD, E2E, compilación de Tauri y Docker).
