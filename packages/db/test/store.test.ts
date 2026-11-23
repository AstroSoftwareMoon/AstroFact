import { describe, expect, it, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import initSqlJs from "sql.js";
import { verificarFirmaXml } from "@astrofact/fiscal-core";
import { AstroFactStore, ErrorValidacion, empaquetarCifrado, desempaquetarCifrado, estaCifrado, type BorradorUI } from "../src";
import { nodeSqlite } from "../src/drivers/node";
import { sqljsDriver } from "../src/drivers/sqljs";

const XSD = resolve(__dirname, "../../../docs/normativa/xsd");
function xsdOk(xml: string, xsd: string) {
  const d = mkdtempSync(join(tmpdir(), "afdb-")); const f = join(d, "x.xml"); writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--nonet", "--schema", join(XSD, xsd), f], { stdio: "pipe" }); return ""; } catch (e: any) { return String(e.stderr); }
}

let reloj = new Date("2026-03-02T09:00:00Z");
const avanza = (s: number) => { reloj = new Date(reloj.getTime() + s * 1000); };

async function montar() {
  reloj = new Date("2026-03-02T09:00:00Z");
  const store = new AstroFactStore(nodeSqlite(), { ahora: () => reloj });
  const o = store.crearObligado({ nif: "89890001K", nombre: "Taller Astro SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas", direccion: { linea1: "C/ Luna 1", cp: "28001", municipio: "Madrid" } });
  const serie = store.crearSerie(o.id, { codigo: "A", plantilla: "{serie}-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true });
  const rect = store.crearSerie(o.id, { codigo: "R", plantilla: "R-{año}-{num:4}", clase: "rectificativa", reinicioAnual: true });
  const cli = store.guardarTercero(o.id, { nombre: "Cliente Ejemplo SL", nif: "B12345674", email: "cli@example.com" });
  return { store, o, serie, rect, cli };
}
const borrador = (terceroId: number, over: Partial<BorradorUI> = {}): BorradorUI => ({
  tipoFactura: "F1", terceroId, descripcionOperacion: "Reparación", retencionPct: "15",
  lineas: [{ descripcion: "Mano de obra", cantidad: "2", precioUnitario: "45", tipo: "21" }, { descripcion: "Pieza", cantidad: "1", precioUnitario: "30.5", tipo: "21", sujetaRetencion: false }],
  ...over,
});

describe("AstroFactStore — emisión No VERI*FACTU", () => {
  let ctx: Awaited<ReturnType<typeof montar>>;
  beforeEach(async () => { ctx = await montar(); });

  it("exige certificado desbloqueado para emitir en No VERI*FACTU", async () => {
    await expect(ctx.store.emitir(ctx.o.id, ctx.serie.id, borrador(ctx.cli.id))).rejects.toThrow(/certificado/);
  });

  it("emite, numera correlativamente, firma y encadena", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "clave-pruebas");
    const f1 = await store.emitir(o.id, serie.id, borrador(cli.id)); avanza(30);
    const f2 = await store.emitir(o.id, serie.id, borrador(cli.id));
    expect([f1.numSerie, f2.numSerie]).toEqual(["A-2026-0001", "A-2026-0002"]);
    expect(f1.totales).toMatchObject({ baseTotal: "120.50", cuotaTotal: "25.31", importeTotal: "145.81", retencion: "13.50", totalAPagar: "132.31" });
    expect(f1.qrUrl).toBe("https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQRNoVerifactu?nif=89890001K&numserie=A-2026-0001&fecha=02-03-2026&importe=145.81");
    expect(f1.dePruebas).toBe(true);
    const regs = store.registros(o.id);
    expect(regs).toHaveLength(2);
    expect(regs[1]!.huellaAnterior).toBe(regs[0]!.huella);
    expect(regs.every((r) => r.firmado)).toBe(true);
    expect((await verificarFirmaXml(regs[0]!.xml)).valida).toBe(true);
    expect(xsdOk(regs[0]!.xml, "SuministroInformacion.xsd")).toBe("");
    const v = await store.verificarIntegridad(o.id);
    expect(v.facturacion.anomalias).toEqual([]);
    expect(v.eventos.ok).toBe(true);
  });

  it("emisiones concurrentes: sin saltos ni duplicados", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    const fs = await Promise.all(Array.from({ length: 6 }, () => store.emitir(o.id, serie.id, borrador(cli.id))));
    expect(fs.map((f) => f.numero).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect((await store.verificarIntegridad(o.id)).facturacion.ok).toBe(true);
  });

  it("rechaza borradores inválidos sin consumir número", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    await expect(store.emitir(o.id, serie.id, borrador(cli.id, { lineas: [{ descripcion: "x", cantidad: "1", precioUnitario: "10", tipo: "12" }] }))).rejects.toBeInstanceOf(ErrorValidacion);
    expect(store.serie(serie.id)!.ultimoNumero).toBe(0);
    expect((await store.emitir(o.id, serie.id, borrador(cli.id))).numero).toBe(1);
  });

  it("inmutabilidad en base de datos (triggers)", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    const f = await store.emitir(o.id, serie.id, borrador(cli.id));
    expect(() => store.db.run("DELETE FROM factura WHERE id = ?", [f.id])).toThrow(/no se puede borrar/);
    expect(() => store.db.run("UPDATE factura SET importe_total = '1.00' WHERE id = ?", [f.id])).toThrow(/no se pueden modificar/);
    expect(() => store.db.run("DELETE FROM registro_facturacion")).toThrow(/inalterables/);
    expect(() => store.db.run("UPDATE registro_facturacion SET xml = 'x'")).toThrow(/inalterables/);
    store.marcarCobro(f.id, "cobrada"); // permitido: dato no fiscal
    expect(store.factura(f.id)!.estadoCobro).toBe("cobrada");
  });

  it("detecta manipulación externa (triggers eliminados) y abre alarma persistente", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    await store.emitir(o.id, serie.id, borrador(cli.id)); avanza(5);
    await store.emitir(o.id, serie.id, borrador(cli.id));
    store.db.exec("DROP TRIGGER rf_no_update");
    store.db.run("UPDATE registro_facturacion SET registro_json = replace(registro_json, '\"ImporteTotal\":\"145.81\"', '\"ImporteTotal\":\"999.00\"') WHERE id = 1");
    const v = await store.verificarIntegridad(o.id);
    expect(v.facturacion.anomalias.map((a) => a.tipo)).toContain("01");
    expect(store.alarmasAbiertas(o.id)).toHaveLength(1);
    expect(store.eventos(o.id).some((e) => e.tipo === "04")).toBe(true);
    await expect(store.emitir(o.id, serie.id, borrador(cli.id))).resolves.toBeTruthy(); // el último registro sigue bien encadenado
  });

  it("anulación: registro de anulación encadenado, la factura no se borra", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    const f = await store.emitir(o.id, serie.id, borrador(cli.id)); avanza(10);
    await store.anular(f.id, "emitida por error");
    expect(store.factura(f.id)!.anulada).toBe(true);
    const regs = store.registros(o.id);
    expect(regs.map((r) => r.tipo)).toEqual(["alta", "anulacion"]);
    expect(xsdOk(regs[1]!.xml, "SuministroInformacion.xsd")).toBe("");
    await expect(store.anular(f.id)).rejects.toThrow(/ya está anulada/);
    expect((await store.verificarIntegridad(o.id)).facturacion.ok).toBe(true);
  });

  it("rectificativa por sustitución y por diferencias", async () => {
    const { store, o, serie, rect, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    const f = await store.emitir(o.id, serie.id, borrador(cli.id)); avanza(10);
    const bS = store.borradorRectificativa(f.id, "S");
    bS.lineas[0]!.precioUnitario = "40";
    const r1 = await store.emitir(o.id, rect.id, bS);
    expect(r1.numSerie).toBe("R-2026-0001");
    expect(r1.datos.rectificacion?.importeRectificacion).toEqual({ baseRectificada: "120.50", cuotaRectificada: "25.31", cuotaRecargoRectificado: undefined });
    expect(store.factura(f.id)!.rectificadaPor).toBe(r1.id);
    const bI = store.borradorRectificativa(f.id, "I");
    const r2 = await store.emitir(o.id, rect.id, bI);
    expect(r2.totales.importeTotal).toBe("-145.81");
    const xml = store.registrosFactura(r2.id)[0]!.xml;
    expect(xml).toContain("<sum1:TipoRectificativa>I</sum1:TipoRectificativa>");
    expect(xsdOk(xml, "SuministroInformacion.xsd")).toBe("");
  });

  it("eventos: inicio No VERI*FACTU, resumen a las 6 h y al cerrar, firma diferida", async () => {
    const { store, o } = ctx;
    await store.arranque(o.id);
    expect(store.eventos(o.id).map((e) => e.tipo)).toEqual(["01"]);
    expect(store.eventos(o.id)[0]!.firmado).toBe(false); // certificado aún bloqueado
    await store.arranque(o.id); // segunda vez no repite el 01
    expect(store.eventos(o.id).filter((e) => e.tipo === "01")).toHaveLength(1);
    avanza(6 * 3600);
    expect(await store.tick(o.id)).toBe(true);
    expect(await store.tick(o.id)).toBe(false);
    await store.generarCertificadoPruebas(o.id, "x"); // firma los pendientes
    expect(store.eventos(o.id).every((e) => e.firmado)).toBe(true);
    await store.cierre(o.id);
    const evs = store.eventos(o.id);
    expect(evs[0]!.tipo).toBe("10");
    for (const e of evs) expect(xsdOk(e.xml, "EventosSIF.xsd")).toBe("");
    expect((await store.verificarIntegridad(o.id)).eventos.ok).toBe(true);
  });

  it("exportación por periodo con evento 08 y XML válido", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    await store.emitir(o.id, serie.id, borrador(cli.id));
    const ex = await store.exportarRegistros(o.id, "2026-03-01", "2026-03-31");
    expect(ex.resumen.numAltas).toBe(1);
    expect(xsdOk(ex.ficheros[0]!.contenido, "SuministroLR.xsd")).toBe("");
    expect(ex.ficheros.some((f) => f.nombre.startsWith("firmados/"))).toBe(true);
    expect(store.eventos(o.id)[0]!.tipo).toBe("08");
    expect(xsdOk(store.eventos(o.id)[0]!.xml, "EventosSIF.xsd")).toBe("");
  });

  it("certificado: cifrado con contraseña y desbloqueo", async () => {
    const { store, o } = ctx;
    await store.generarCertificadoPruebas(o.id, "secreta");
    store.bloquearCertificados();
    expect(store.certificadoDesbloqueado(o.id)).toBe(false);
    await expect(store.desbloquearCertificado(o.id, "mala")).rejects.toThrow(/Contraseña/);
    await store.desbloquearCertificado(o.id, "secreta");
    expect(store.certificado(o.id)).toMatchObject({ dePruebas: true, nif: "89890001K" });
  });

  it("RGPD: anonimiza datos de contacto y conserva las facturas", async () => {
    const { store, o, serie, cli } = ctx;
    await store.generarCertificadoPruebas(o.id, "x");
    await store.emitir(o.id, serie.id, borrador(cli.id));
    store.anonimizarTercero(cli.id);
    expect(store.tercero(cli.id)).toMatchObject({ email: undefined, nombre: "Cliente Ejemplo SL" });
    expect(store.exportarDatosTercero(cli.id).facturas).toHaveLength(1);
  });

  it("valida NIF de clientes y del negocio", () => {
    expect(() => ctx.store.guardarTercero(ctx.o.id, { nombre: "X", nif: "12345678A" })).toThrow(/NIF/);
    expect(() => ctx.store.crearObligado({ nif: "00000000A", nombre: "X", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas" })).toThrow(/NIF/);
  });
});

describe("sql.js + base de datos cifrada", () => {
  it("persiste, cifra y reabre con el mismo contenido", async () => {
    const SQL = await initSqlJs();
    const d1 = sqljsDriver(SQL);
    const s1 = new AstroFactStore(d1);
    const o = s1.crearObligado({ nif: "89890001K", nombre: "Persistente SL", territorio: "canarias", modo: "no_verifactu", entorno: "pruebas" });
    s1.guardarProducto(o.id, { nombre: "Hora de trabajo", precio: "35" });
    const blob = await empaquetarCifrado(d1.exportar(), "pass");
    expect(estaCifrado(blob)).toBe(true);
    await expect(desempaquetarCifrado(blob, "otra")).rejects.toThrow();
    const s2 = new AstroFactStore(sqljsDriver(SQL, await desempaquetarCifrado(blob, "pass")));
    expect(s2.obligado()!.nombre).toBe("Persistente SL");
    expect(s2.productos(o.id).map((p) => p.nombre)).toEqual(["Hora de trabajo"]);
    expect(() => s2.db.run("DELETE FROM factura")).not.toThrow(); // sin filas, el trigger no salta
  });
});
