import { describe, expect, it } from "vitest";
import { cabezaEventoDe, construirEvento, datosResumen, recalcularHuellaEvento, registroEventoXml, resumenPendiente, verificarCadenaEventos } from "../src";
import { SISTEMA } from "./fixtures";

const OB = { NombreRazon: "Empresa", NIF: "89890001K" };

function cadena() {
  const e1 = construirEvento({ sistema: SISTEMA, obligado: OB, tipo: "01", fechaHoraGen: "2025-02-03T10:00:00+01:00", anterior: null });
  const e2 = construirEvento({ sistema: SISTEMA, obligado: OB, tipo: "03", fechaHoraGen: "2025-02-03T11:00:00+01:00", anterior: cabezaEventoDe(e1),
    datos: { LanzamientoProcesoDeteccionAnomaliasRegFacturacion: { RealizadoProcesoSobreIntegridadHuellasRegFacturacion: "S", NumeroDeRegistrosFacturacionProcesadosSobreIntegridadHuellas: 3,
      RealizadoProcesoSobreIntegridadFirmasRegFacturacion: "S", RealizadoProcesoSobreTrazabilidadCadenaRegFacturacion: "S", RealizadoProcesoSobreTrazabilidadFechasRegFacturacion: "S" } } });
  const e3 = construirEvento({ sistema: SISTEMA, obligado: OB, tipo: "10", fechaHoraGen: "2025-02-03T16:00:00+01:00", anterior: cabezaEventoDe(e2),
    datos: datosResumen([e1, e2], [{ CuotaTotal: "21.40", ImporteTotal: "131.40" }, { CuotaTotal: "-21.40", ImporteTotal: "-131.40" }], 1) });
  return [e1, e2, e3];
}

describe("Registro de eventos (art. 9 Orden)", () => {
  it("encadenado y huella", () => {
    const [e1, e2] = cadena();
    expect(e1!.Evento.Encadenamiento).toEqual({ PrimerEvento: "S" });
    expect(e2!.Evento.Encadenamiento).toEqual({ EventoAnterior: { TipoEvento: "01", FechaHoraHusoGenEvento: e1!.Evento.FechaHoraHusoGenEvento, HuellaEvento: e1!.Evento.HuellaEvento } });
    expect(recalcularHuellaEvento(e2!)).toBe(e2!.Evento.HuellaEvento);
    expect(verificarCadenaEventos(cadena(), new Date("2025-02-04")).ok).toBe(true);
  });
  it("resumen: cuenta eventos y suma importes", () => {
    const e3 = cadena()[2]!;
    const r = (e3.Evento.DatosPropiosEvento as any).ResumenEventos;
    expect(r.TipoEvento).toEqual([{ TipoEvento: "01", NumeroDeEventos: 1 }, { TipoEvento: "03", NumeroDeEventos: 1 }]);
    expect(r.SumaImporteTotalAlta).toBe("0.00");
    expect(r.NumeroDeRegistrosFacturacionAnulacionGenerados).toBe(1);
  });
  it("detecta manipulación de eventos", () => {
    const evs = JSON.parse(JSON.stringify(cadena()));
    evs[1].Evento.TipoEvento = "04";
    expect(verificarCadenaEventos(evs, new Date("2025-02-04")).anomalias.map((a) => a.tipo)).toContain("01");
  });
  it("resumen cada 6 horas", () => {
    const ini = new Date("2025-02-03T08:00:00Z");
    expect(resumenPendiente(null, ini, new Date("2025-02-03T13:59:59Z"))).toBe(false);
    expect(resumenPendiente(null, ini, new Date("2025-02-03T14:00:00Z"))).toBe(true);
    expect(resumenPendiente(new Date("2025-02-03T14:00:00Z"), ini, new Date("2025-02-03T15:00:00Z"))).toBe(false);
  });
  it("XML del evento con datos propios", () => {
    const xml = registroEventoXml(cadena()[1]!);
    expect(xml).toContain("<sf:LanzamientoProcesoDeteccionAnomaliasRegFacturacion>");
    expect(xml).toContain("<sf:NumeroDeRegistrosFacturacionProcesadosSobreIntegridadHuellas>3<");
  });
});
