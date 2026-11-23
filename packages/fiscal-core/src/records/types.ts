/**
 * Tipos de los registros de facturación con los MISMOS nombres de campo que el diseño
 * oficial (XSD SuministroInformacion.xsd / DsRegistroVeriFactu.xlsx). Importes y tipos
 * como cadenas ya formateadas para XML (ver decimal.ts → fmtImporte / fmtTipo).
 */
import type { Calificacion, ClaveRegimen, IdType, Impuesto, OperacionExenta, TipoEvento, TipoFactura, TipoRectificativa } from "../constants";

export type SN = "S" | "N";

export interface IDOtro { CodigoPais?: string; IDType: IdType; ID: string; }
/** PersonaFisicaJuridicaType: NombreRazon + (NIF | IDOtro) */
export interface PersonaFisicaJuridica { NombreRazon: string; NIF?: string; IDOtro?: IDOtro; }
/** PersonaFisicaJuridicaESType */
export interface PersonaFisicaJuridicaES { NombreRazon: string; NIF: string; }

export interface IDFactura { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; }
export interface IDFacturaAnulada { IDEmisorFacturaAnulada: string; NumSerieFacturaAnulada: string; FechaExpedicionFacturaAnulada: string; }

export interface DetalleDesglose {
  Impuesto?: Impuesto;
  ClaveRegimen?: ClaveRegimen;
  /** Excluyente con OperacionExenta */
  CalificacionOperacion?: Calificacion;
  OperacionExenta?: OperacionExenta;
  TipoImpositivo?: string;
  BaseImponibleOimporteNoSujeto: string;
  BaseImponibleACoste?: string;
  CuotaRepercutida?: string;
  TipoRecargoEquivalencia?: string;
  CuotaRecargoEquivalencia?: string;
}

export interface ImporteRectificacion { BaseRectificada: string; CuotaRectificada: string; CuotaRecargoRectificado?: string; }

export interface RegistroAnteriorRef { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; Huella: string; }
export type Encadenamiento = { PrimerRegistro: "S" } | { RegistroAnterior: RegistroAnteriorRef };

export interface SistemaInformatico {
  NombreRazon: string;
  NIF?: string;
  IDOtro?: IDOtro;
  NombreSistemaInformatico: string;
  /** 2 posiciones: mayúscula (excepto Ñ) o dígito */
  IdSistemaInformatico: string;
  Version: string;
  NumeroInstalacion: string;
  TipoUsoPosibleSoloVerifactu: SN;
  TipoUsoPosibleMultiOT: SN;
  IndicadorMultiplesOT: SN;
}

export interface RegistroAlta {
  IDVersion: "1.0";
  IDFactura: IDFactura;
  RefExterna?: string;
  NombreRazonEmisor: string;
  Subsanacion?: SN;
  RechazoPrevio?: "N" | "S" | "X";
  TipoFactura: TipoFactura;
  TipoRectificativa?: TipoRectificativa;
  FacturasRectificadas?: IDFactura[];
  FacturasSustituidas?: IDFactura[];
  ImporteRectificacion?: ImporteRectificacion;
  FechaOperacion?: string;
  DescripcionOperacion: string;
  FacturaSimplificadaArt7273?: SN;
  FacturaSinIdentifDestinatarioArt61d?: SN;
  Macrodato?: SN;
  EmitidaPorTerceroODestinatario?: "D" | "T";
  Tercero?: PersonaFisicaJuridica;
  Destinatarios?: PersonaFisicaJuridica[];
  Cupon?: SN;
  Desglose: DetalleDesglose[];
  CuotaTotal: string;
  ImporteTotal: string;
  Encadenamiento: Encadenamiento;
  SistemaInformatico: SistemaInformatico;
  FechaHoraHusoGenRegistro: string;
  NumRegistroAcuerdoFacturacion?: string;
  IdAcuerdoSistemaInformatico?: string;
  TipoHuella: "01";
  Huella: string;
}

export interface RegistroAnulacion {
  IDVersion: "1.0";
  IDFactura: IDFacturaAnulada;
  RefExterna?: string;
  SinRegistroPrevio?: SN;
  RechazoPrevio?: SN;
  GeneradoPor?: "E" | "D" | "T";
  Generador?: PersonaFisicaJuridica;
  Encadenamiento: Encadenamiento;
  SistemaInformatico: SistemaInformatico;
  FechaHoraHusoGenRegistro: string;
  TipoHuella: "01";
  Huella: string;
}

export type RegistroFacturacion = { tipo: "alta"; registro: RegistroAlta } | { tipo: "anulacion"; registro: RegistroAnulacion };

/* ----------------------------- Eventos ----------------------------- */
export interface IDFacturaHuella extends IDFactura { Huella: string; }
export interface RegEventoRef { TipoEvento: TipoEvento; FechaHoraHusoEvento: string; HuellaEvento: string; }

export type DatosPropiosEvento =
  | { LanzamientoProcesoDeteccionAnomaliasRegFacturacion: {
      RealizadoProcesoSobreIntegridadHuellasRegFacturacion: SN; NumeroDeRegistrosFacturacionProcesadosSobreIntegridadHuellas?: number;
      RealizadoProcesoSobreIntegridadFirmasRegFacturacion: SN; NumeroDeRegistrosFacturacionProcesadosSobreIntegridadFirmas?: number;
      RealizadoProcesoSobreTrazabilidadCadenaRegFacturacion: SN; NumeroDeRegistrosFacturacionProcesadosSobreTrazabilidadCadena?: number;
      RealizadoProcesoSobreTrazabilidadFechasRegFacturacion: SN; NumeroDeRegistrosFacturacionProcesadosSobreTrazabilidadFechas?: number; } }
  | { DeteccionAnomaliasRegFacturacion: { TipoAnomalia: string; OtrosDatosAnomalia?: string; RegistroFacturacionAnomalo?: IDFactura } }
  | { LanzamientoProcesoDeteccionAnomaliasRegEvento: {
      RealizadoProcesoSobreIntegridadHuellasRegEvento: SN; NumeroDeRegistrosEventoProcesadosSobreIntegridadHuellas?: number;
      RealizadoProcesoSobreIntegridadFirmasRegEvento: SN; NumeroDeRegistrosEventoProcesadosSobreIntegridadFirmas?: number;
      RealizadoProcesoSobreTrazabilidadCadenaRegEvento: SN; NumeroDeRegistrosEventoProcesadosSobreTrazabilidadCadena?: number;
      RealizadoProcesoSobreTrazabilidadFechasRegEvento: SN; NumeroDeRegistrosEventoProcesadosSobreTrazabilidadFechas?: number; } }
  | { DeteccionAnomaliasRegEvento: { TipoAnomalia: string; OtrosDatosAnomalia?: string; RegEventoAnomalo?: RegEventoRef } }
  | { ExportacionRegFacturacionPeriodo: {
      FechaHoraHusoInicioPeriodoExport: string; FechaHoraHusoFinPeriodoExport: string;
      RegistroFacturacionInicialPeriodo: IDFacturaHuella; RegistroFacturacionFinalPeriodo: IDFacturaHuella;
      NumeroDeRegistrosFacturacionAltaExportados: number; SumaCuotaTotalAlta: string; SumaImporteTotalAlta: string;
      NumeroDeRegistrosFacturacionAnulacionExportados: number; RegistrosFacturacionExportadosDejanDeConservarse: SN; } }
  | { ExportacionRegEventoPeriodo: {
      FechaHoraHusoInicioPeriodoExport: string; FechaHoraHusoFinPeriodoExport: string;
      RegistroEventoInicialPeriodo: RegEventoRef; RegistroEventoFinalPeriodo: RegEventoRef;
      NumeroDeRegEventoExportados: number; RegEventoExportadosDejanDeConservarse: SN; } }
  | { ResumenEventos: {
      TipoEvento: { TipoEvento: TipoEvento; NumeroDeEventos: number }[];
      RegistroFacturacionInicialPeriodo?: IDFacturaHuella; RegistroFacturacionFinalPeriodo?: IDFacturaHuella;
      NumeroDeRegistrosFacturacionAltaGenerados: number; SumaCuotaTotalAlta: string; SumaImporteTotalAlta: string;
      NumeroDeRegistrosFacturacionAnulacionGenerados: number; } };

export type EncadenamientoEvento = { PrimerEvento: "S" } | { EventoAnterior: { TipoEvento: TipoEvento; FechaHoraHusoGenEvento: string; HuellaEvento: string } };

export interface RegistroEvento {
  IDVersion: "1.0";
  Evento: {
    SistemaInformatico: SistemaInformatico;
    ObligadoEmision: PersonaFisicaJuridicaES;
    EmitidaPorTerceroODestinatario?: "D" | "T";
    TerceroODestinatario?: PersonaFisicaJuridica;
    FechaHoraHusoGenEvento: string;
    TipoEvento: TipoEvento;
    DatosPropiosEvento?: DatosPropiosEvento;
    OtrosDatosEvento?: string;
    Encadenamiento: EncadenamientoEvento;
    TipoHuella: "01";
    HuellaEvento: string;
  };
}
