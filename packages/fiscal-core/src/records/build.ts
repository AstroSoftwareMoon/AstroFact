/**
 * Construcción de registros de facturación de alta y anulación a partir de una factura,
 * con su encadenamiento (art. 7 Orden) y huella (art. 13 Orden).
 */
import { D, fmtImporte, fmtTipo } from "../decimal";
import { isoDateToAeat } from "../dates";
import { huellaAlta, huellaAnulacion, TIPO_HUELLA_SHA256 } from "../hash";
import { ID_VERSION, LIMITES } from "../constants";
import { calcularTotales, type Totales } from "../invoice/calc";
import type { FacturaBorrador, Parte } from "../invoice/types";
import type {
  DetalleDesglose, Encadenamiento, IDFactura, PersonaFisicaJuridica, RegistroAlta, RegistroAnulacion,
  RegistroFacturacion, SistemaInformatico,
} from "./types";

/** Datos del último registro de la cadena necesarios para encadenar el siguiente. */
export interface CabezaCadena {
  IDEmisorFactura: string;
  NumSerieFactura: string;
  FechaExpedicionFactura: string;
  Huella: string;
  FechaHoraHusoGenRegistro: string;
}

export function cabezaDe(r: RegistroFacturacion): CabezaCadena {
  if (r.tipo === "alta") {
    const a = r.registro;
    return { ...a.IDFactura, Huella: a.Huella, FechaHoraHusoGenRegistro: a.FechaHoraHusoGenRegistro };
  }
  const b = r.registro;
  return {
    IDEmisorFactura: b.IDFactura.IDEmisorFacturaAnulada,
    NumSerieFactura: b.IDFactura.NumSerieFacturaAnulada,
    FechaExpedicionFactura: b.IDFactura.FechaExpedicionFacturaAnulada,
    Huella: b.Huella,
    FechaHoraHusoGenRegistro: b.FechaHoraHusoGenRegistro,
  };
}

export function encadenamientoDesde(anterior: CabezaCadena | null): Encadenamiento {
  if (!anterior) return { PrimerRegistro: "S" };
  return { RegistroAnterior: {
    IDEmisorFactura: anterior.IDEmisorFactura, NumSerieFactura: anterior.NumSerieFactura,
    FechaExpedicionFactura: anterior.FechaExpedicionFactura, Huella: anterior.Huella.slice(0, 64),
  } };
}
const huellaAnteriorDe = (enc: Encadenamiento) => ("RegistroAnterior" in enc ? enc.RegistroAnterior.Huella : "");

export function parteAPersona(p: Parte): PersonaFisicaJuridica {
  if (p.nif) return { NombreRazon: p.nombre, NIF: p.nif };
  if (p.idOtro) return { NombreRazon: p.nombre, IDOtro: { CodigoPais: p.idOtro.codigoPais, IDType: p.idOtro.idType, ID: p.idOtro.id } };
  throw new Error(`El destinatario "${p.nombre}" necesita NIF o identificador extranjero`);
}

export function desgloseRegistro(t: Totales): DetalleDesglose[] {
  return t.desglose.map((g) => {
    const d: DetalleDesglose = {
      Impuesto: g.impuesto,
      ClaveRegimen: g.impuesto === "05" ? undefined : g.claveRegimen,
      BaseImponibleOimporteNoSujeto: fmtImporte(g.base),
    };
    if (g.exenta) d.OperacionExenta = g.exenta;
    else d.CalificacionOperacion = g.calificacion;
    if (g.calificacion === "S1") {
      d.TipoImpositivo = fmtTipo(g.tipo ?? D(0));
      d.CuotaRepercutida = fmtImporte(g.cuota);
      if (g.recargo) { d.TipoRecargoEquivalencia = fmtTipo(g.recargo); d.CuotaRecargoEquivalencia = fmtImporte(g.cuotaRecargo); }
    } else if (g.calificacion === "S2") {
      // Validaciones 15.4: con S2, TipoImpositivo = 0 y CuotaRepercutida = 0 obligatorios
      d.TipoImpositivo = "0";
      d.CuotaRepercutida = fmtImporte(0);
    }
    return d;
  });
}

export interface OpcionesAlta {
  factura: FacturaBorrador;
  sistema: SistemaInformatico;
  anterior: CabezaCadena | null;
  /** FechaHoraHusoGenRegistro (ISO con huso). Usar dates.toIsoWithOffset(new Date()). */
  fechaHoraGen: string;
  subsanacion?: boolean;
  rechazoPrevio?: "N" | "S" | "X";
  totales?: Totales;
}

export function construirRegistroAlta(o: OpcionesAlta): { registro: RegistroAlta; totales: Totales } {
  const f = o.factura;
  const t = o.totales ?? calcularTotales(f);
  const enc = encadenamientoDesde(o.anterior);
  const IDFactura: IDFactura = { IDEmisorFactura: f.emisor.nif, NumSerieFactura: f.numSerie.trim(), FechaExpedicionFactura: isoDateToAeat(f.fechaExpedicion) };
  const rect = f.rectificacion;
  const r: RegistroAlta = {
    IDVersion: ID_VERSION,
    IDFactura,
    RefExterna: f.refExterna,
    NombreRazonEmisor: f.emisor.nombre,
    Subsanacion: o.subsanacion ? "S" : undefined,
    RechazoPrevio: o.rechazoPrevio && o.rechazoPrevio !== "N" ? o.rechazoPrevio : undefined,
    TipoFactura: f.tipoFactura,
    TipoRectificativa: rect?.tipo,
    FacturasRectificadas: rect?.facturas,
    FacturasSustituidas: f.facturasSustituidas,
    ImporteRectificacion: rect?.tipo === "S" && rect.importeRectificacion ? {
      BaseRectificada: fmtImporte(rect.importeRectificacion.baseRectificada),
      CuotaRectificada: fmtImporte(rect.importeRectificacion.cuotaRectificada),
      CuotaRecargoRectificado: rect.importeRectificacion.cuotaRecargoRectificado ? fmtImporte(rect.importeRectificacion.cuotaRecargoRectificado) : undefined,
    } : undefined,
    FechaOperacion: f.fechaOperacion && f.fechaOperacion !== f.fechaExpedicion ? isoDateToAeat(f.fechaOperacion) : undefined,
    DescripcionOperacion: f.descripcionOperacion,
    FacturaSimplificadaArt7273: f.simplificadaArt7273 ? "S" : undefined,
    FacturaSinIdentifDestinatarioArt61d: f.sinIdentifDestinatarioArt61d ? "S" : undefined,
    Macrodato: t.importeTotal.abs().cmp(LIMITES.macrodatoEuros) >= 0 ? "S" : undefined,
    Destinatarios: f.destinatarios?.length ? f.destinatarios.map(parteAPersona) : undefined,
    Desglose: desgloseRegistro(t),
    CuotaTotal: fmtImporte(t.cuotaTotal),
    ImporteTotal: fmtImporte(t.importeTotal),
    Encadenamiento: enc,
    SistemaInformatico: o.sistema,
    FechaHoraHusoGenRegistro: o.fechaHoraGen,
    TipoHuella: TIPO_HUELLA_SHA256,
    Huella: "",
  };
  r.Huella = huellaAlta({
    IDEmisorFactura: IDFactura.IDEmisorFactura, NumSerieFactura: IDFactura.NumSerieFactura,
    FechaExpedicionFactura: IDFactura.FechaExpedicionFactura, TipoFactura: r.TipoFactura,
    CuotaTotal: r.CuotaTotal, ImporteTotal: r.ImporteTotal, Huella: huellaAnteriorDe(enc),
    FechaHoraHusoGenRegistro: r.FechaHoraHusoGenRegistro,
  });
  return { registro: r, totales: t };
}

export interface OpcionesAnulacion {
  factura: IDFactura;
  sistema: SistemaInformatico;
  anterior: CabezaCadena | null;
  fechaHoraGen: string;
  sinRegistroPrevio?: boolean;
  rechazoPrevio?: boolean;
  generadoPor?: "E" | "D" | "T";
  generador?: PersonaFisicaJuridica;
  refExterna?: string;
}

export function construirRegistroAnulacion(o: OpcionesAnulacion): RegistroAnulacion {
  const enc = encadenamientoDesde(o.anterior);
  const r: RegistroAnulacion = {
    IDVersion: ID_VERSION,
    IDFactura: {
      IDEmisorFacturaAnulada: o.factura.IDEmisorFactura,
      NumSerieFacturaAnulada: o.factura.NumSerieFactura,
      FechaExpedicionFacturaAnulada: o.factura.FechaExpedicionFactura,
    },
    RefExterna: o.refExterna,
    SinRegistroPrevio: o.sinRegistroPrevio ? "S" : undefined,
    RechazoPrevio: o.rechazoPrevio ? "S" : undefined,
    GeneradoPor: o.generadoPor,
    Generador: o.generador,
    Encadenamiento: enc,
    SistemaInformatico: o.sistema,
    FechaHoraHusoGenRegistro: o.fechaHoraGen,
    TipoHuella: TIPO_HUELLA_SHA256,
    Huella: "",
  };
  r.Huella = huellaAnulacion({
    IDEmisorFacturaAnulada: r.IDFactura.IDEmisorFacturaAnulada,
    NumSerieFacturaAnulada: r.IDFactura.NumSerieFacturaAnulada,
    FechaExpedicionFacturaAnulada: r.IDFactura.FechaExpedicionFacturaAnulada,
    Huella: huellaAnteriorDe(enc),
    FechaHoraHusoGenRegistro: r.FechaHoraHusoGenRegistro,
  });
  return r;
}

/** Recalcula la huella de un registro existente (para verificación, art. 6.b). */
export function recalcularHuella(r: RegistroFacturacion): string {
  if (r.tipo === "alta") {
    const a = r.registro;
    return huellaAlta({ ...a.IDFactura, TipoFactura: a.TipoFactura, CuotaTotal: a.CuotaTotal, ImporteTotal: a.ImporteTotal,
      Huella: huellaAnteriorDe(a.Encadenamiento), FechaHoraHusoGenRegistro: a.FechaHoraHusoGenRegistro });
  }
  const b = r.registro;
  return huellaAnulacion({ ...b.IDFactura, Huella: huellaAnteriorDe(b.Encadenamiento), FechaHoraHusoGenRegistro: b.FechaHoraHusoGenRegistro });
}
