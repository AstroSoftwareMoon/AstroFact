/**
 * Interpretación de la respuesta RespuestaRegFactuSistemaFacturacion (RespuestaSuministro.xsd)
 * y de SOAP Faults. Estados (Validaciones v1.2.2 apdo. 4): envío Correcto / ParcialmenteCorrecto /
 * Incorrecto; registro Correcto / AceptadoConErrores / Incorrecto.
 */
import { DOMParser } from "@xmldom/xmldom";

export type EstadoEnvio = "Correcto" | "ParcialmenteCorrecto" | "Incorrecto";
export type EstadoRegistro = "Correcto" | "AceptadoConErrores" | "Incorrecto";

export interface LineaRespuesta {
  IDEmisorFactura: string;
  NumSerieFactura: string;
  FechaExpedicionFactura: string;
  TipoOperacion?: "Alta" | "Anulacion";
  Subsanacion?: string;
  RechazoPrevio?: string;
  RefExterna?: string;
  EstadoRegistro: EstadoRegistro;
  CodigoErrorRegistro?: number;
  DescripcionErrorRegistro?: string;
  RegistroDuplicado?: { IdPeticionRegistroDuplicado: string; EstadoRegistroDuplicado: string; CodigoErrorRegistro?: number; DescripcionErrorRegistro?: string };
}

export type RespuestaAeat =
  | { tipo: "respuesta"; CSV?: string; TiempoEsperaEnvio: number; EstadoEnvio: EstadoEnvio; lineas: LineaRespuesta[]; NIFPresentador?: string; TimestampPresentacion?: string }
  | { tipo: "fault"; faultcode: string; faultstring: string; detalle?: string };

const kids = (e: Element) => Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const child = (e: Element | undefined, name: string) => (e ? kids(e).find((k) => k.localName === name) : undefined);
const text = (e: Element | undefined, name: string) => child(e, name)?.textContent?.trim() || undefined;
function findDeep(e: Element, name: string): Element | undefined {
  if (e.localName === name) return e;
  for (const k of kids(e)) { const r = findDeep(k, name); if (r) return r; }
  return undefined;
}

export function parsearRespuesta(xml: string): RespuestaAeat {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const root = doc.documentElement as unknown as Element;
  if (!root) throw new Error("Respuesta vacía o no XML");
  const fault = findDeep(root, "Fault");
  if (fault) return { tipo: "fault", faultcode: text(fault, "faultcode") ?? "", faultstring: text(fault, "faultstring") ?? "", detalle: child(fault, "detail")?.textContent?.trim() || undefined };
  const resp = findDeep(root, "RespuestaRegFactuSistemaFacturacion");
  if (!resp) throw new Error("La respuesta no contiene RespuestaRegFactuSistemaFacturacion");
  const datos = child(resp, "DatosPresentacion");
  const lineas: LineaRespuesta[] = kids(resp).filter((k) => k.localName === "RespuestaLinea").map((l) => {
    const id = child(l, "IDFactura");
    const op = child(l, "Operacion");
    const dup = child(l, "RegistroDuplicado");
    const cod = text(l, "CodigoErrorRegistro");
    return {
      IDEmisorFactura: text(id, "IDEmisorFactura") ?? text(id, "IDEmisorFacturaAnulada") ?? "",
      NumSerieFactura: text(id, "NumSerieFactura") ?? text(id, "NumSerieFacturaAnulada") ?? "",
      FechaExpedicionFactura: text(id, "FechaExpedicionFactura") ?? text(id, "FechaExpedicionFacturaAnulada") ?? "",
      TipoOperacion: text(op, "TipoOperacion") as LineaRespuesta["TipoOperacion"],
      Subsanacion: text(op, "Subsanacion"),
      RechazoPrevio: text(op, "RechazoPrevio"),
      RefExterna: text(l, "RefExterna"),
      EstadoRegistro: (text(l, "EstadoRegistro") ?? "Incorrecto") as EstadoRegistro,
      CodigoErrorRegistro: cod ? Number(cod) : undefined,
      DescripcionErrorRegistro: text(l, "DescripcionErrorRegistro"),
      RegistroDuplicado: dup ? {
        IdPeticionRegistroDuplicado: text(dup, "IdPeticionRegistroDuplicado") ?? "",
        EstadoRegistroDuplicado: text(dup, "EstadoRegistroDuplicado") ?? "",
        CodigoErrorRegistro: text(dup, "CodigoErrorRegistro") ? Number(text(dup, "CodigoErrorRegistro")) : undefined,
        DescripcionErrorRegistro: text(dup, "DescripcionErrorRegistro"),
      } : undefined,
    };
  });
  return {
    tipo: "respuesta",
    CSV: text(resp, "CSV"),
    TiempoEsperaEnvio: Number(text(resp, "TiempoEsperaEnvio") ?? 60),
    EstadoEnvio: (text(resp, "EstadoEnvio") ?? "Incorrecto") as EstadoEnvio,
    lineas,
    NIFPresentador: text(datos, "NIFPresentador"),
    TimestampPresentacion: text(datos, "TimestampPresentacion"),
  };
}

/** Estado interno de AstroFact para cada registro tras una respuesta. */
export type EstadoEnvioRegistro = "pendiente" | "enviando" | "aceptado" | "aceptado_con_errores" | "rechazado" | "error_transporte";
export function estadoInterno(l: LineaRespuesta): EstadoEnvioRegistro {
  return l.EstadoRegistro === "Correcto" ? "aceptado" : l.EstadoRegistro === "AceptadoConErrores" ? "aceptado_con_errores" : "rechazado";
}
