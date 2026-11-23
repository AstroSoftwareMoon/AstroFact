import type { Factura } from "@astrofact/db";
import { Chip } from "../ui/kit";
/** Estado visible de cada factura. En VERI*FACTU (fase 5) se añadirá «Enviada a la AEAT / Error». */
export default function EstadoFactura({ f }: { f: Factura }) {
  if (f.anulada) return <Chip tono="bad">Anulada</Chip>;
  if (f.rectificadaPor) return <Chip tono="warn">Rectificada</Chip>;
  return <Chip tono="acc">Emitida · registro firmado</Chip>;
}
