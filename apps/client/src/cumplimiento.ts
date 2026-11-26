/**
 * Datos de cumplimiento de ESTA compilación. Los datos del productor (art. 15 Orden HAC/1177/2024)
 * no se inventan: los fija quien distribuye la versión con variables VITE_PRODUCTOR_* al compilar
 * (ver docs/cumplimiento/README.md). Si faltan, la declaración se muestra como pendiente.
 */
import { PRODUCTOR_POR_DEFECTO, type ProductorSif } from "@astrofact/db";
import plantilla from "../../../docs/cumplimiento/declaracion-responsable.md?raw";

const env = import.meta.env;
export const productor = {
  nombre: env.VITE_PRODUCTOR_NOMBRE?.trim() || undefined, nif: env.VITE_PRODUCTOR_NIF?.trim().toUpperCase() || undefined,
  direccion: env.VITE_PRODUCTOR_DIRECCION?.trim() || undefined, fecha: env.VITE_PRODUCTOR_FECHA?.trim() || undefined,
  lugar: env.VITE_PRODUCTOR_LUGAR?.trim() || undefined, contacto: env.VITE_PRODUCTOR_CONTACTO?.trim() || undefined,
};
export const declaracionCompleta = !!(productor.nombre && productor.nif && productor.direccion && productor.fecha && productor.lugar);

/** Bloque SistemaInformatico de los registros: productor de la compilación (o el provisional del proyecto). */
export function productorSif(): ProductorSif {
  return { ...PRODUCTOR_POR_DEFECTO, Version: __APP_VERSION__, ...(productor.nombre && productor.nif ? { NombreRazon: productor.nombre.slice(0, 120), NIF: productor.nif } : {}) };
}

/** Declaración responsable con los datos de esta versión. */
export function declaracionResponsable(): string {
  let t = plantilla.replace("**[x.y.z]**", `**${__APP_VERSION__}**`);
  if (productor.nombre) t = t.replace(/(h\) [^:]+: )\*\*\[PENDIENTE\]\*\*/, `$1**${productor.nombre}**`);
  if (productor.nif) t = t.replace(/(i\) [^:]+: )\*\*\[PENDIENTE\]\*\*/, `$1**${productor.nif}**`);
  if (productor.direccion) t = t.replace(/(j\) [^:]+: )\*\*\[PENDIENTE\]\*\*/, `$1**${productor.direccion}**`);
  if (productor.fecha && productor.lugar) t = t.replace("**[DD-MM-AAAA], [Localidad], [País]**", `**${productor.fecha}, ${productor.lugar}**`);
  if (productor.contacto) t = t.replace("- Otras formas de contacto: [email / web]", `- Otras formas de contacto: ${productor.contacto}`);
  return t;
}
