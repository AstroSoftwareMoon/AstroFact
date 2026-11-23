import { describe, expect, it } from "vitest";
import { backoffMs, esperaRestante, estadoFlujoInicial, estadoInterno, parsearRespuesta, puedeEnviar, tamanoLote, trasEnvio } from "../src";

const RESP = `<?xml version="1.0" encoding="UTF-8"?>
<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body>
<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/RespuestaSuministro.xsd" xmlns:tik="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">
<tikR:CSV>A-ABCDEF123456</tikR:CSV>
<tikR:DatosPresentacion><tik:NIFPresentador>89890001K</tik:NIFPresentador><tik:TimestampPresentacion>2025-02-03T10:01:00+01:00</tik:TimestampPresentacion></tikR:DatosPresentacion>
<tikR:Cabecera><tik:ObligadoEmision><tik:NombreRazon>Empresa</tik:NombreRazon><tik:NIF>89890001K</tik:NIF></tik:ObligadoEmision></tikR:Cabecera>
<tikR:TiempoEsperaEnvio>120</tikR:TiempoEsperaEnvio>
<tikR:EstadoEnvio>ParcialmenteCorrecto</tikR:EstadoEnvio>
<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>89890001K</tik:IDEmisorFactura><tik:NumSerieFactura>A-1</tik:NumSerieFactura><tik:FechaExpedicionFactura>03-02-2025</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>Correcto</tikR:EstadoRegistro></tikR:RespuestaLinea>
<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>89890001K</tik:IDEmisorFactura><tik:NumSerieFactura>A-2</tik:NumSerieFactura><tik:FechaExpedicionFactura>03-02-2025</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>AceptadoConErrores</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>2000</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Huella no coincide</tikR:DescripcionErrorRegistro></tikR:RespuestaLinea>
<tikR:RespuestaLinea><tikR:IDFactura><tik:IDEmisorFactura>89890001K</tik:IDEmisorFactura><tik:NumSerieFactura>A-3</tik:NumSerieFactura><tik:FechaExpedicionFactura>03-02-2025</tik:FechaExpedicionFactura></tikR:IDFactura><tikR:Operacion><tik:TipoOperacion>Alta</tik:TipoOperacion></tikR:Operacion><tikR:EstadoRegistro>Incorrecto</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>1100</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>Valor o tipo incorrecto</tikR:DescripcionErrorRegistro></tikR:RespuestaLinea>
</tikR:RespuestaRegFactuSistemaFacturacion></env:Body></env:Envelope>`;

describe("Respuesta AEAT", () => {
  it("interpreta envío parcialmente correcto", () => {
    const r = parsearRespuesta(RESP);
    if (r.tipo !== "respuesta") throw new Error("esperaba respuesta");
    expect(r).toMatchObject({ CSV: "A-ABCDEF123456", TiempoEsperaEnvio: 120, EstadoEnvio: "ParcialmenteCorrecto", NIFPresentador: "89890001K" });
    expect(r.lineas.map(estadoInterno)).toEqual(["aceptado", "aceptado_con_errores", "rechazado"]);
    expect(r.lineas[2]).toMatchObject({ NumSerieFactura: "A-3", CodigoErrorRegistro: 1100 });
  });
  it("interpreta SOAP Fault (rechazo completo por esquema)", () => {
    const r = parsearRespuesta(`<env:Envelope xmlns:env="http://schemas.xmlsoap.org/soap/envelope/"><env:Body><env:Fault><faultcode>env:Client</faultcode><faultstring>Codigo[4102].El XML no cumple el esquema</faultstring></env:Fault></env:Body></env:Envelope>`);
    expect(r).toMatchObject({ tipo: "fault", faultcode: "env:Client" });
  });
});

describe("Control de flujo (art. 16.2 Orden)", () => {
  it("primer envío inmediato, luego espera t segundos o 1000 registros", () => {
    let e = estadoFlujoInicial();
    expect(e.tiempoEsperaSeg).toBe(60);
    expect(puedeEnviar(e, 1, 0)).toBe(true);
    e = trasEnvio(e, 0, 120);
    expect(e.tiempoEsperaSeg).toBe(120);
    expect(puedeEnviar(e, 10, 119_999)).toBe(false);
    expect(esperaRestante(e, 10, 100_000)).toBe(20_000);
    expect(puedeEnviar(e, 10, 120_000)).toBe(true);
    expect(puedeEnviar(e, 1000, 1)).toBe(true);
    expect(puedeEnviar(e, 0, 10e9)).toBe(false);
    expect(tamanoLote(2500)).toBe(1000);
  });
  it("backoff exponencial con tope", () => {
    expect(backoffMs(1)).toBe(30_000);
    expect(backoffMs(3)).toBe(120_000);
    expect(backoffMs(20)).toBe(30 * 60_000);
  });
});
