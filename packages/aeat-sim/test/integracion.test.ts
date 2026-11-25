import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AstroFactStore, MotorVerifactu, type BorradorUI } from "@astrofact/db";
import { nodeSqlite } from "@astrofact/db/node";
import { transporteNode } from "@astrofact/db/transporte-node";
import { arrancarSimulador } from "../src";
import { crearPki } from "./pki";

const XSD = resolve(__dirname, "../../../docs/normativa/xsd");
const hayXmllint = (() => { try { execFileSync("xmllint", ["--version"], { stdio: "ignore" }); return true; } catch { return false; } })();
function validaRespuesta(xml: string) {
  const cuerpo = /<tikR:RespuestaRegFactuSistemaFacturacion[\s\S]*<\/tikR:RespuestaRegFactuSistemaFacturacion>/.exec(xml)![0];
  const d = mkdtempSync(join(tmpdir(), "resp-")); const f = join(d, "r.xml"); writeFileSync(f, cuerpo);
  try { execFileSync("xmllint", ["--noout", "--nonet", "--schema", join(XSD, "RespuestaSuministro.xsd"), f], { stdio: "pipe" }); return ""; } catch (e: any) { return String(e.stderr); }
}

const NIF = "89890001K";
let pki: ReturnType<typeof crearPki>;
let srv: Awaited<ReturnType<typeof arrancarSimulador>>;
let reloj = Date.now();

beforeAll(async () => {
  pki = crearPki(NIF);
  srv = await arrancarSimulador({ tls: { ...pki.servidor, ca: pki.caPem }, xsdDir: hayXmllint ? XSD : undefined, tiempoEsperaSeg: 30 });
});
afterAll(async () => { await srv?.cerrar(); });

async function montar() {
  srv.sim.registros.clear(); srv.sim.fallosPendientes = 0; srv.sim.o.noCensados = [];
  const store = new AstroFactStore(nodeSqlite(), { ahora: () => new Date(reloj) });
  const o = store.crearObligado({ nif: NIF, nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "verifactu", entorno: "pruebas" });
  const serie = store.crearSerie(o.id, { codigo: "V", plantilla: "V-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true });
  const cli = store.guardarTercero(o.id, { nombre: "Cliente SL", nif: "B12345674" });
  await store.guardarCertificado(o.id, pki.clienteP12, pki.clienteClave);
  const motor = new MotorVerifactu(store, transporteNode({ ca: pki.caPem }), { ahora: () => reloj, url: () => srv.url });
  const b = (over: Partial<BorradorUI> = {}): BorradorUI => ({ tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Servicio", lineas: [{ descripcion: "Hora", cantidad: "2", precioUnitario: "50", tipo: "21" }], ...over });
  return { store, o, serie, cli, motor, b };
}

describe("VERI*FACTU extremo a extremo (simulador con mTLS)", () => {
  it("emite, envía en lote, aplica respuesta y CSV; respuesta válida contra RespuestaSuministro.xsd", async () => {
    const { store, o, serie, motor, b } = await montar();
    const fs = [];
    for (let i = 0; i < 3; i++) { fs.push(await store.emitir(o.id, serie.id, b())); reloj += 1000; }
    expect(fs[0]!.qrUrl).toMatch(/\/ValidarQR\?nif=89890001K/);
    expect(store.registros(o.id).every((r) => r.estadoAeat === "pendiente" && !r.firmado)).toBe(true); // VERI*FACTU: sin firma
    const r = await motor.tick(o.id);
    expect(r).toMatchObject({ accion: "enviado", estado: "Correcto", aceptados: 3, rechazados: 0, tiempoEspera: 30 });
    expect(store.registros(o.id).every((x) => x.estadoAeat === "aceptado" && x.aeatCsv)).toBe(true);
    expect(store.factura(fs[0]!.id)!.estadoAeat).toBe("aceptado");
    if (hayXmllint) expect(validaRespuesta(store.envioDetalle((r as any).envioId).respuesta_xml)).toBe("");
  });

  it("control de flujo: espera TiempoEsperaEnvio entre envíos", async () => {
    const { store, o, serie, motor, b } = await montar();
    await store.emitir(o.id, serie.id, b()); await motor.tick(o.id);
    reloj += 5000; await store.emitir(o.id, serie.id, b());
    const r = await motor.tick(o.id);
    expect(r).toMatchObject({ accion: "esperar", motivo: "flujo" });
    expect((r as any).ms).toBe(25_000);
    reloj += 25_000;
    expect(await motor.tick(o.id)).toMatchObject({ accion: "enviado", aceptados: 1 });
  });

  it("error de transporte: vuelve a la cola con backoff y se recupera", async () => {
    const { store, o, serie, motor, b } = await montar();
    await store.emitir(o.id, serie.id, b());
    srv.sim.fallosPendientes = 1;
    const r = await motor.tick(o.id);
    expect(r).toMatchObject({ accion: "error", reintentoEnMs: 30_000 });
    expect(store.registros(o.id)[0]!.estadoAeat).toBe("pendiente");
    expect(await motor.tick(o.id)).toMatchObject({ accion: "esperar", motivo: "reintento" });
    reloj += 30_000;
    expect(await motor.tick(o.id)).toMatchObject({ accion: "enviado", aceptados: 1 });
    expect(store.envios(o.id).map((e) => e.estado)).toEqual(["Correcto", "error_transporte"]);
  });

  it("rechazo (NIF no censado, 1110) → alarma → subsanación «alta por rechazo» (S/X) aceptada", async () => {
    const { store, o, serie, motor, b } = await montar();
    srv.sim.o.noCensados = ["B12345674"];
    const f = await store.emitir(o.id, serie.id, b());
    const r = await motor.tick(o.id);
    srv.sim.o.noCensados = [];
    expect(r).toMatchObject({ accion: "enviado", estado: "Incorrecto", rechazados: 1 });
    const reg = store.registrosFactura(f.id)[0]!;
    expect(reg).toMatchObject({ estadoAeat: "rechazado", aeatCodigo: 1110, aeatDescripcion: "El NIF no está identificado en el censo de la AEAT." });
    expect(store.alarmasAbiertas(o.id).some((a) => a.tipo === "aeat_rechazo")).toBe(true);
    const sub = await store.subsanar(f.id);
    expect(sub.situacion).toBe("rechazado");
    expect(sub.xml).toContain("<sum1:Subsanacion>S</sum1:Subsanacion>");
    expect(sub.xml).toContain("<sum1:RechazoPrevio>X</sum1:RechazoPrevio>");
    reloj += 30_000;
    expect(await motor.tick(o.id)).toMatchObject({ accion: "enviado", aceptados: 1 });
    expect(store.factura(f.id)!.estadoAeat).toBe("aceptado");
    expect(store.alarmasAbiertas(o.id).some((a) => a.tipo === "aeat_rechazo")).toBe(false);
    expect((await store.verificarIntegridad(o.id)).facturacion.ok).toBe(true); // la subsanación forma parte de la cadena
  });

  it("anulación normal (nota 7) y anulación sin registro previo (nota 9)", async () => {
    const { store, o, serie, motor, b } = await montar();
    const f1 = await store.emitir(o.id, serie.id, b());
    await motor.tick(o.id); reloj += 30_000;
    await store.anular(f1.id);
    expect(store.registrosFactura(f1.id)[1]!.situacion).toBe("normal");
    expect(await motor.tick(o.id)).toMatchObject({ accion: "enviado", aceptados: 1 });
    // Una factura cuyo alta fue rechazada → la anulación va «sin registro previo»
    srv.sim.o.noCensados = ["B12345674"];
    const f2 = await store.emitir(o.id, serie.id, b()); reloj += 30_000;
    await motor.tick(o.id); srv.sim.o.noCensados = [];
    await store.anular(f2.id);
    const an = store.registrosFactura(f2.id)[1]!;
    expect(an.situacion).toBe("sin_registro_previo");
    expect(an.xml).toContain("<sum1:SinRegistroPrevio>S</sum1:SinRegistroPrevio>");
    reloj += 30_000;
    expect(await motor.tick(o.id)).toMatchObject({ accion: "enviado", aceptados: 1 });
  });

  it("duplicado ya registrado como correcto (3000 + RegistroDuplicado) se trata como aceptado", async () => {
    const { store, o, serie, motor, b } = await montar();
    const f = await store.emitir(o.id, serie.id, b());
    const peticion = store.pendientesEnvio(o.id, 10);
    // Simula que la AEAT ya recibió el registro pero la respuesta se perdió
    const { sobreSoap } = await import("@astrofact/fiscal-core");
    srv.sim.procesar(sobreSoap({ ObligadoEmision: { NombreRazon: "Estudio Lunar SL", NIF } }, peticion.map((p) => p.registro)));
    const r = await motor.tick(o.id);
    expect(r).toMatchObject({ accion: "enviado", aceptados: 1, rechazados: 0 });
    expect(store.registrosFactura(f.id)[0]!.aeatDescripcion).toMatch(/Ya registrado/);
  });

  it("sin certificado de cliente válido, la conexión se rechaza (mTLS)", async () => {
    const { store, o, serie, b } = await montar();
    await store.emitir(o.id, serie.id, b());
    const otra = crearPki(NIF); // certificado de otra CA
    const motor = new MotorVerifactu(store, { enviar: (u, s) => transporteNode({ ca: pki.caPem }).enviar(u, s, { p12: otra.clienteP12, password: otra.clienteClave }) }, { ahora: () => reloj, url: () => srv.url });
    const r = await motor.tick(o.id);
    expect(r.accion).toBe("error");
    expect(store.registros(o.id)[0]!.estadoAeat).toBe("pendiente");
  });

  it("certificado bloqueado: el motor no envía y lo indica", async () => {
    const { store, o, serie, motor, b } = await montar();
    await store.emitir(o.id, serie.id, b());
    store.bloquearCertificados();
    expect(await motor.tick(o.id)).toEqual({ accion: "bloqueado", motivo: "sin_certificado" });
  });
});

describe("Simulador: validaciones", () => {
  it("SOAP no conforme al esquema → Fault 4102", () => {
    if (!hayXmllint) return;
    const r = srv.sim.procesar(`<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body><sum:RegFactuSistemaFacturacion xmlns:sum="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd"><sum:Cabecera/></sum:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>`);
    expect(r.status).toBe(500);
    expect(r.body).toContain("Codigo[4102]");
  });
  it("huella incorrecta → AceptadoConErrores 2000", async () => {
    const { store, o, serie, b } = await montar();
    await store.emitir(o.id, serie.id, b());
    const { sobreSoap } = await import("@astrofact/fiscal-core");
    const p = store.pendientesEnvio(o.id, 1)[0]!.registro;
    (p.registro as any).Huella = "A".repeat(64);
    const r = srv.sim.procesar(sobreSoap({ ObligadoEmision: { NombreRazon: "X", NIF } }, [p]));
    expect(r.body).toContain("<tikR:EstadoRegistro>AceptadoConErrores</tikR:EstadoRegistro><tikR:CodigoErrorRegistro>2000</tikR:CodigoErrorRegistro>");
    if (hayXmllint) expect(validaRespuesta(r.body)).toBe("");
  });
});
