/**
 * Registro de eventos (art. 9 Orden HAC/1177/2024; EventosSIF.xsd; listas L1E/L2E).
 * Encadenado y huella análogos a los registros de facturación (art. 9.3, art. 13.1.c).
 * Solo obligatorio en modo No VERI*FACTU (art. 3), pero AstroFact lo mantiene siempre
 * además de un "diario de auditoría" interno para eventos no tipificados (tipo 90).
 */
import { ID_VERSION, LIMITES, type TipoAnomalia, type TipoEvento } from "./constants";
import { parseIsoWithOffset } from "./dates";
import { D, fmtImporte, sum } from "./decimal";
import { huellaEvento, TIPO_HUELLA_SHA256 } from "./hash";
import type { DatosPropiosEvento, PersonaFisicaJuridicaES, RegistroEvento, SistemaInformatico } from "./records/types";

export interface CabezaEventos { TipoEvento: TipoEvento; FechaHoraHusoGenEvento: string; HuellaEvento: string; }

export interface OpcionesEvento {
  sistema: SistemaInformatico;
  obligado: PersonaFisicaJuridicaES;
  tipo: TipoEvento;
  fechaHoraGen: string;
  anterior: CabezaEventos | null;
  datos?: DatosPropiosEvento;
  otrosDatos?: string;
}

export function construirEvento(o: OpcionesEvento): RegistroEvento {
  const ev: RegistroEvento = {
    IDVersion: ID_VERSION,
    Evento: {
      SistemaInformatico: o.sistema,
      ObligadoEmision: o.obligado,
      FechaHoraHusoGenEvento: o.fechaHoraGen,
      TipoEvento: o.tipo,
      DatosPropiosEvento: o.datos,
      OtrosDatosEvento: o.otrosDatos?.slice(0, 100),
      Encadenamiento: o.anterior ? { EventoAnterior: { ...o.anterior, HuellaEvento: o.anterior.HuellaEvento.slice(0, 64) } } : { PrimerEvento: "S" },
      TipoHuella: TIPO_HUELLA_SHA256,
      HuellaEvento: "",
    },
  };
  ev.Evento.HuellaEvento = recalcularHuellaEvento(ev);
  return ev;
}

export function recalcularHuellaEvento(r: RegistroEvento): string {
  const e = r.Evento;
  return huellaEvento({
    NIF: e.SistemaInformatico.NIF, ID: e.SistemaInformatico.IDOtro?.ID,
    IdSistemaInformatico: e.SistemaInformatico.IdSistemaInformatico, Version: e.SistemaInformatico.Version,
    NumeroInstalacion: e.SistemaInformatico.NumeroInstalacion, NIFObligado: e.ObligadoEmision.NIF,
    TipoEvento: e.TipoEvento,
    HuellaEvento: "EventoAnterior" in e.Encadenamiento ? e.Encadenamiento.EventoAnterior.HuellaEvento : "",
    FechaHoraHusoGenEvento: e.FechaHoraHusoGenEvento,
  });
}

export const cabezaEventoDe = (r: RegistroEvento): CabezaEventos => ({ TipoEvento: r.Evento.TipoEvento, FechaHoraHusoGenEvento: r.Evento.FechaHoraHusoGenEvento, HuellaEvento: r.Evento.HuellaEvento });

/** Verifica la cadena de eventos (art. 9.3 → arts. 6 y 7 aplicados a eventos). */
export function verificarCadenaEventos(evs: RegistroEvento[], ahora = new Date()): { ok: boolean; anomalias: { indice: number; tipo: TipoAnomalia; mensaje: string }[] } {
  const anomalias: { indice: number; tipo: TipoAnomalia; mensaje: string }[] = [];
  evs.forEach((r, i) => {
    if (recalcularHuellaEvento(r) !== r.Evento.HuellaEvento) anomalias.push({ indice: i, tipo: "01", mensaje: "Huella del evento incorrecta" });
    const enc = r.Evento.Encadenamiento;
    if (i === 0 && !("PrimerEvento" in enc)) anomalias.push({ indice: i, tipo: "04", mensaje: "Primer evento sin marca PrimerEvento" });
    if (i > 0) {
      if ("PrimerEvento" in enc) anomalias.push({ indice: i, tipo: "06", mensaje: "Evento marcado como primero con eventos anteriores" });
      else if (enc.EventoAnterior.HuellaEvento !== evs[i - 1]!.Evento.HuellaEvento) anomalias.push({ indice: i, tipo: "08", mensaje: "La huella del evento anterior no coincide" });
      if (parseIsoWithOffset(r.Evento.FechaHoraHusoGenEvento) < parseIsoWithOffset(evs[i - 1]!.Evento.FechaHoraHusoGenEvento))
        anomalias.push({ indice: i, tipo: "11", mensaje: "Fecha-hora anterior a la del evento anterior" });
    }
    if (parseIsoWithOffset(r.Evento.FechaHoraHusoGenEvento).getTime() > ahora.getTime() + LIMITES.margenRelojSeg * 1000)
      anomalias.push({ indice: i, tipo: "13", mensaje: "Fecha-hora de generación posterior a la actual" });
  });
  return { ok: anomalias.length === 0, anomalias };
}

/**
 * ¿Toca generar el registro resumen? Art. 9.2: al menos uno por cada 6 horas operativo
 * y siempre antes de cerrar. `inicioOperativo` = arranque de la sesión actual.
 */
export function resumenPendiente(ultimoResumen: Date | null, inicioOperativo: Date, ahora: Date): boolean {
  const ref = ultimoResumen && ultimoResumen > inicioOperativo ? ultimoResumen : inicioOperativo;
  return ahora.getTime() - ref.getTime() >= LIMITES.resumenEventosHoras * 3600_000;
}

/** Datos del resumen de eventos a partir de los eventos y registros del periodo. */
export function datosResumen(eventos: RegistroEvento[], altas: { CuotaTotal: string; ImporteTotal: string }[], numAnulaciones: number,
  inicial?: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; Huella: string },
  final?: { IDEmisorFactura: string; NumSerieFactura: string; FechaExpedicionFactura: string; Huella: string },
  ): DatosPropiosEvento {
  const sumar = (xs: string[]) => fmtImporte(sum(xs.map((x) => D(x))));
  const cuenta = new Map<TipoEvento, number>();
  for (const e of eventos) if (e.Evento.TipoEvento !== "10") cuenta.set(e.Evento.TipoEvento, (cuenta.get(e.Evento.TipoEvento) ?? 0) + 1);
  // XSD exige ≥1 TipoEvento; si no hubo eventos, se refleja con tipo 10 y 0 eventos (art. 9.2 párr. 2).
  // TODO(normativa): confirmar con la AEAT la representación de "sin eventos" en ResumenEventos.
  const tipos = cuenta.size ? [...cuenta].sort().map(([TipoEvento, NumeroDeEventos]) => ({ TipoEvento, NumeroDeEventos })) : [{ TipoEvento: "10" as TipoEvento, NumeroDeEventos: 0 }];
  return { ResumenEventos: {
    TipoEvento: tipos.slice(0, 20),
    RegistroFacturacionInicialPeriodo: inicial, RegistroFacturacionFinalPeriodo: final,
    NumeroDeRegistrosFacturacionAltaGenerados: altas.length,
    SumaCuotaTotalAlta: sumar(altas.map((a) => a.CuotaTotal)),
    SumaImporteTotalAlta: sumar(altas.map((a) => a.ImporteTotal)),
    NumeroDeRegistrosFacturacionAnulacionGenerados: numAnulaciones,
  } };
}
