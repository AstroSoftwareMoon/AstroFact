/**
 * Serialización XML de registros según el orden exacto de los XSD oficiales
 * (SuministroInformacion.xsd, EventosSIF.xsd). Arts. 9.4, 10 y 11 Orden HAC/1177/2024:
 * formato XML, UTF-8, estructura del anexo.
 */
import { NS } from "../constants";
import { el, opt, serialize, toXmlDocument, type XmlNode } from "../xml/writer";
import type {
  DatosPropiosEvento, Encadenamiento, IDFactura, IDOtro, PersonaFisicaJuridica, RegistroAlta, RegistroAnulacion,
  RegistroEvento, SistemaInformatico,
} from "./types";

const P = "sum1"; // prefijo de SuministroInformacion (como en los ejemplos AEAT)
const n = (name: string) => `${P}:${name}`;
const e = (name: string, ...c: (XmlNode | string | null | undefined)[]) => el(n(name), ...c);
const o = (name: string, v: string | undefined) => opt(n(name), v);

function idOtro(x: IDOtro, pfx: (s: string) => string = n): XmlNode {
  return el(pfx("IDOtro"), opt(pfx("CodigoPais"), x.CodigoPais), el(pfx("IDType"), x.IDType), el(pfx("ID"), x.ID));
}
function persona(name: string, p: PersonaFisicaJuridica, pfx: (s: string) => string = n): XmlNode {
  if (!!p.NIF === !!p.IDOtro) throw new Error(`${name}: debe informarse NIF o IDOtro (excluyentes)`);
  return el(pfx(name), el(pfx("NombreRazon"), p.NombreRazon), p.NIF ? el(pfx("NIF"), p.NIF) : idOtro(p.IDOtro!, pfx));
}
function idFactura(name: string, f: IDFactura): XmlNode {
  return e(name, e("IDEmisorFactura", f.IDEmisorFactura), e("NumSerieFactura", f.NumSerieFactura), e("FechaExpedicionFactura", f.FechaExpedicionFactura));
}
export function sistemaInformaticoXml(s: SistemaInformatico, pfx: (s: string) => string = n): XmlNode {
  if (!!s.NIF === !!s.IDOtro) throw new Error("SistemaInformatico: debe informarse NIF o IDOtro (excluyentes)");
  return el(pfx("SistemaInformatico"),
    el(pfx("NombreRazon"), s.NombreRazon),
    s.NIF ? el(pfx("NIF"), s.NIF) : idOtro(s.IDOtro!, pfx),
    el(pfx("NombreSistemaInformatico"), s.NombreSistemaInformatico),
    el(pfx("IdSistemaInformatico"), s.IdSistemaInformatico),
    el(pfx("Version"), s.Version),
    el(pfx("NumeroInstalacion"), s.NumeroInstalacion),
    el(pfx("TipoUsoPosibleSoloVerifactu"), s.TipoUsoPosibleSoloVerifactu),
    el(pfx("TipoUsoPosibleMultiOT"), s.TipoUsoPosibleMultiOT),
    el(pfx("IndicadorMultiplesOT"), s.IndicadorMultiplesOT));
}
function encadenamiento(c: Encadenamiento): XmlNode {
  if ("PrimerRegistro" in c) return e("Encadenamiento", e("PrimerRegistro", "S"));
  const r = c.RegistroAnterior;
  return e("Encadenamiento", e("RegistroAnterior",
    e("IDEmisorFactura", r.IDEmisorFactura), e("NumSerieFactura", r.NumSerieFactura),
    e("FechaExpedicionFactura", r.FechaExpedicionFactura), e("Huella", r.Huella)));
}

export function registroAltaNode(r: RegistroAlta, withNs = false): XmlNode {
  const node = e("RegistroAlta",
    e("IDVersion", r.IDVersion),
    idFactura("IDFactura", r.IDFactura),
    o("RefExterna", r.RefExterna),
    e("NombreRazonEmisor", r.NombreRazonEmisor),
    o("Subsanacion", r.Subsanacion),
    o("RechazoPrevio", r.RechazoPrevio),
    e("TipoFactura", r.TipoFactura),
    o("TipoRectificativa", r.TipoRectificativa),
    r.FacturasRectificadas?.length ? e("FacturasRectificadas", ...r.FacturasRectificadas.map((f) => idFactura("IDFacturaRectificada", f))) : null,
    r.FacturasSustituidas?.length ? e("FacturasSustituidas", ...r.FacturasSustituidas.map((f) => idFactura("IDFacturaSustituida", f))) : null,
    r.ImporteRectificacion ? e("ImporteRectificacion",
      e("BaseRectificada", r.ImporteRectificacion.BaseRectificada),
      e("CuotaRectificada", r.ImporteRectificacion.CuotaRectificada),
      o("CuotaRecargoRectificado", r.ImporteRectificacion.CuotaRecargoRectificado)) : null,
    o("FechaOperacion", r.FechaOperacion),
    e("DescripcionOperacion", r.DescripcionOperacion),
    o("FacturaSimplificadaArt7273", r.FacturaSimplificadaArt7273),
    o("FacturaSinIdentifDestinatarioArt61d", r.FacturaSinIdentifDestinatarioArt61d),
    o("Macrodato", r.Macrodato),
    o("EmitidaPorTerceroODestinatario", r.EmitidaPorTerceroODestinatario),
    r.Tercero ? persona("Tercero", r.Tercero) : null,
    r.Destinatarios?.length ? e("Destinatarios", ...r.Destinatarios.map((d) => persona("IDDestinatario", d))) : null,
    o("Cupon", r.Cupon),
    e("Desglose", ...r.Desglose.map((d) => e("DetalleDesglose",
      o("Impuesto", d.Impuesto),
      o("ClaveRegimen", d.ClaveRegimen),
      d.OperacionExenta ? e("OperacionExenta", d.OperacionExenta) : o("CalificacionOperacion", d.CalificacionOperacion),
      o("TipoImpositivo", d.TipoImpositivo),
      e("BaseImponibleOimporteNoSujeto", d.BaseImponibleOimporteNoSujeto),
      o("BaseImponibleACoste", d.BaseImponibleACoste),
      o("CuotaRepercutida", d.CuotaRepercutida),
      o("TipoRecargoEquivalencia", d.TipoRecargoEquivalencia),
      o("CuotaRecargoEquivalencia", d.CuotaRecargoEquivalencia)))),
    e("CuotaTotal", r.CuotaTotal),
    e("ImporteTotal", r.ImporteTotal),
    encadenamiento(r.Encadenamiento),
    sistemaInformaticoXml(r.SistemaInformatico),
    e("FechaHoraHusoGenRegistro", r.FechaHoraHusoGenRegistro),
    o("NumRegistroAcuerdoFacturacion", r.NumRegistroAcuerdoFacturacion),
    o("IdAcuerdoSistemaInformatico", r.IdAcuerdoSistemaInformatico),
    e("TipoHuella", r.TipoHuella),
    e("Huella", r.Huella));
  if (withNs) node.attrs = { [`xmlns:${P}`]: NS.SuministroInformacion };
  return node;
}

export function registroAnulacionNode(r: RegistroAnulacion, withNs = false): XmlNode {
  const node = e("RegistroAnulacion",
    e("IDVersion", r.IDVersion),
    e("IDFactura",
      e("IDEmisorFacturaAnulada", r.IDFactura.IDEmisorFacturaAnulada),
      e("NumSerieFacturaAnulada", r.IDFactura.NumSerieFacturaAnulada),
      e("FechaExpedicionFacturaAnulada", r.IDFactura.FechaExpedicionFacturaAnulada)),
    o("RefExterna", r.RefExterna),
    o("SinRegistroPrevio", r.SinRegistroPrevio),
    o("RechazoPrevio", r.RechazoPrevio),
    o("GeneradoPor", r.GeneradoPor),
    r.Generador ? persona("Generador", r.Generador) : null,
    encadenamiento(r.Encadenamiento),
    sistemaInformaticoXml(r.SistemaInformatico),
    e("FechaHoraHusoGenRegistro", r.FechaHoraHusoGenRegistro),
    e("TipoHuella", r.TipoHuella),
    e("Huella", r.Huella));
  if (withNs) node.attrs = { [`xmlns:${P}`]: NS.SuministroInformacion };
  return node;
}

/** Documento XML autónomo (raíz RegistroAlta) — el que se firma y conserva en No VERI*FACTU. */
export const registroAltaXml = (r: RegistroAlta) => toXmlDocument(registroAltaNode(r, true));
export const registroAnulacionXml = (r: RegistroAnulacion) => toXmlDocument(registroAnulacionNode(r, true));

/* ----------------------------- Eventos ----------------------------- */
const EP = "sf";
const en = (s: string) => `${EP}:${s}`;
const ee = (name: string, ...c: (XmlNode | string | null | undefined)[]) => el(en(name), ...c);
const eo = (name: string, v: string | number | undefined) => opt(en(name), v === undefined ? undefined : String(v));

function idFacturaHuella(name: string, f: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; Huella: string }) {
  return ee(name, ee("IDEmisorFactura", f.IDEmisorFactura), ee("NumSerieFactura", f.NumSerieFactura), ee("FechaExpedicionFactura", f.FechaExpedicionFactura), ee("Huella", f.Huella));
}
function regEvento(name: string, r: { TipoEvento: string; FechaHoraHusoEvento: string; HuellaEvento: string }) {
  return ee(name, ee("TipoEvento", r.TipoEvento), ee("FechaHoraHusoEvento", r.FechaHoraHusoEvento), ee("HuellaEvento", r.HuellaEvento));
}
function datosPropios(d: DatosPropiosEvento): XmlNode {
  const [[key, val]] = Object.entries(d) as [[string, Record<string, unknown>]];
  let inner: XmlNode;
  switch (key) {
    case "DeteccionAnomaliasRegFacturacion": {
      const v = val as { TipoAnomalia: string; OtrosDatosAnomalia?: string; RegistroFacturacionAnomalo?: IDFactura };
      inner = ee(key, ee("TipoAnomalia", v.TipoAnomalia), eo("OtrosDatosAnomalia", v.OtrosDatosAnomalia),
        v.RegistroFacturacionAnomalo ? ee("RegistroFacturacionAnomalo", ee("IDEmisorFactura", v.RegistroFacturacionAnomalo.IDEmisorFactura),
          ee("NumSerieFactura", v.RegistroFacturacionAnomalo.NumSerieFactura), ee("FechaExpedicionFactura", v.RegistroFacturacionAnomalo.FechaExpedicionFactura)) : null);
      break;
    }
    case "DeteccionAnomaliasRegEvento": {
      const v = val as { TipoAnomalia: string; OtrosDatosAnomalia?: string; RegEventoAnomalo?: { TipoEvento: string; FechaHoraHusoEvento: string; HuellaEvento: string } };
      inner = ee(key, ee("TipoAnomalia", v.TipoAnomalia), eo("OtrosDatosAnomalia", v.OtrosDatosAnomalia), v.RegEventoAnomalo ? regEvento("RegEventoAnomalo", v.RegEventoAnomalo) : null);
      break;
    }
    case "ExportacionRegFacturacionPeriodo": {
      const v = val as any;
      inner = ee(key, ee("FechaHoraHusoInicioPeriodoExport", v.FechaHoraHusoInicioPeriodoExport), ee("FechaHoraHusoFinPeriodoExport", v.FechaHoraHusoFinPeriodoExport),
        idFacturaHuella("RegistroFacturacionInicialPeriodo", v.RegistroFacturacionInicialPeriodo), idFacturaHuella("RegistroFacturacionFinalPeriodo", v.RegistroFacturacionFinalPeriodo),
        ee("NumeroDeRegistrosFacturacionAltaExportados", String(v.NumeroDeRegistrosFacturacionAltaExportados)), ee("SumaCuotaTotalAlta", v.SumaCuotaTotalAlta),
        ee("SumaImporteTotalAlta", v.SumaImporteTotalAlta), ee("NumeroDeRegistrosFacturacionAnulacionExportados", String(v.NumeroDeRegistrosFacturacionAnulacionExportados)),
        ee("RegistrosFacturacionExportadosDejanDeConservarse", v.RegistrosFacturacionExportadosDejanDeConservarse));
      break;
    }
    case "ExportacionRegEventoPeriodo": {
      const v = val as any;
      inner = ee(key, ee("FechaHoraHusoInicioPeriodoExport", v.FechaHoraHusoInicioPeriodoExport), ee("FechaHoraHusoFinPeriodoExport", v.FechaHoraHusoFinPeriodoExport),
        regEvento("RegistroEventoInicialPeriodo", v.RegistroEventoInicialPeriodo), regEvento("RegistroEventoFinalPeriodo", v.RegistroEventoFinalPeriodo),
        ee("NumeroDeRegEventoExportados", String(v.NumeroDeRegEventoExportados)), ee("RegEventoExportadosDejanDeConservarse", v.RegEventoExportadosDejanDeConservarse));
      break;
    }
    case "ResumenEventos": {
      const v = val as any;
      inner = ee(key, ...v.TipoEvento.map((t: any) => ee("TipoEvento", ee("TipoEvento", t.TipoEvento), ee("NumeroDeEventos", String(t.NumeroDeEventos)))),
        v.RegistroFacturacionInicialPeriodo ? idFacturaHuella("RegistroFacturacionInicialPeriodo", v.RegistroFacturacionInicialPeriodo) : null,
        v.RegistroFacturacionFinalPeriodo ? idFacturaHuella("RegistroFacturacionFinalPeriodo", v.RegistroFacturacionFinalPeriodo) : null,
        ee("NumeroDeRegistrosFacturacionAltaGenerados", String(v.NumeroDeRegistrosFacturacionAltaGenerados)), ee("SumaCuotaTotalAlta", v.SumaCuotaTotalAlta),
        ee("SumaImporteTotalAlta", v.SumaImporteTotalAlta), ee("NumeroDeRegistrosFacturacionAnulacionGenerados", String(v.NumeroDeRegistrosFacturacionAnulacionGenerados)));
      break;
    }
    default: {
      // Lanzamiento de procesos: secuencia de pares Realizado/Numero en el orden declarado
      inner = ee(key, ...Object.entries(val).filter(([, x]) => x !== undefined).map(([k, x]) => ee(k, String(x))));
    }
  }
  return ee("DatosPropiosEvento", inner);
}

export function registroEventoNode(r: RegistroEvento): XmlNode {
  const ev = r.Evento;
  const enc = "PrimerEvento" in ev.Encadenamiento
    ? ee("Encadenamiento", ee("PrimerEvento", "S"))
    : ee("Encadenamiento", ee("EventoAnterior", ee("TipoEvento", ev.Encadenamiento.EventoAnterior.TipoEvento),
        ee("FechaHoraHusoGenEvento", ev.Encadenamiento.EventoAnterior.FechaHoraHusoGenEvento), ee("HuellaEvento", ev.Encadenamiento.EventoAnterior.HuellaEvento)));
  return el(en("RegistroEvento"), { [`xmlns:${EP}`]: NS.EventosSIF },
    ee("IDVersion", r.IDVersion),
    ee("Evento",
      sistemaInformaticoXml(ev.SistemaInformatico, en),
      ee("ObligadoEmision", ee("NombreRazon", ev.ObligadoEmision.NombreRazon), ee("NIF", ev.ObligadoEmision.NIF)),
      eo("EmitidaPorTerceroODestinatario", ev.EmitidaPorTerceroODestinatario),
      ev.TerceroODestinatario ? persona("TerceroODestinatario", ev.TerceroODestinatario, en) : null,
      ee("FechaHoraHusoGenEvento", ev.FechaHoraHusoGenEvento),
      ee("TipoEvento", ev.TipoEvento),
      ev.DatosPropiosEvento ? datosPropios(ev.DatosPropiosEvento) : null,
      eo("OtrosDatosEvento", ev.OtrosDatosEvento),
      enc,
      ee("TipoHuella", ev.TipoHuella),
      ee("HuellaEvento", ev.HuellaEvento)));
}
export const registroEventoXml = (r: RegistroEvento) => toXmlDocument(registroEventoNode(r));
export { serialize };
