import type { EstadoAeat, Factura } from "@astrofact/db";
import { Chip } from "../ui/kit";

export const ETIQUETA_AEAT: Record<EstadoAeat, [string, "ok" | "warn" | "bad" | "acc" | "neutro"]> = {
  pendiente: ["Pendiente de envío a la AEAT", "neutro"], enviando: ["Enviando a la AEAT…", "acc"], aceptado: ["Aceptada por la AEAT", "ok"],
  aceptado_con_errores: ["Aceptada con errores", "warn"], rechazado: ["Rechazada por la AEAT", "bad"],
};
/** Estado visible de cada factura: emitida / anulada / rectificada y, en VERI*FACTU, su situación en la AEAT. */
export default function EstadoFactura({ f }: { f: Factura }) {
  const base = f.anulada ? <Chip tono="bad">Anulada</Chip> : f.rectificadaPor ? <Chip tono="warn">Rectificada</Chip> : null;
  if (f.estadoAeat) { const [t, tono] = ETIQUETA_AEAT[f.estadoAeat]; return <span className="inline-flex flex-wrap gap-1.5">{base}<Chip tono={tono}>{t}</Chip></span>; }
  return base ?? <Chip tono="acc">{f.qrUrl ? "Emitida · registro firmado" : "Emitida"}</Chip>;
}
