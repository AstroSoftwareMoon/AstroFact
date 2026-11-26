import { beforeEach, describe, expect, it } from "vitest";
import { AstroFactStore, calcularGasto, sumarMeses, textoRecordatorio, type BorradorUI } from "../src";
import { nodeSqlite } from "../src/drivers/node";

let reloj = new Date("2026-03-10T09:00:00Z");
let s: AstroFactStore, oid: number, serie: number, cli: number, cli2: number;
const b = (over: Partial<BorradorUI> = {}): BorradorUI => ({ tipoFactura: "F1", terceroId: cli, descripcionOperacion: "Servicios", lineas: [{ descripcion: "Hora", cantidad: "10", precioUnitario: "50", tipo: "21" }], ...over });

beforeEach(async () => {
  reloj = new Date("2026-03-10T09:00:00Z");
  s = new AstroFactStore(nodeSqlite(), { ahora: () => reloj });
  oid = s.crearObligado({ nif: "89890001K", nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas", iban: "ES91 2100 0418 4502 0005 1332" }).id;
  serie = s.crearSerie(oid, { codigo: "A", plantilla: "A-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true }).id;
  cli = s.guardarTercero(oid, { nombre: "Cliente Uno SL", nif: "B12345674" }).id;
  cli2 = s.guardarTercero(oid, { nombre: "Otro Cliente SA", nif: "A58818501" }).id;
  await s.generarCertificadoPruebas(oid, "x");
});

describe("Gastos", () => {
  it("calcula cuotas, recargo y retención con redondeo exacto", () => {
    const c = calcularGasto([{ base: "100", tipo: "21" }, { base: "33.33", tipo: "10", recargo: "1.4" }], "15");
    expect(c).toMatchObject({ baseTotal: "133.33", cuotaTotal: "24.80", retencion: "20.00", total: "138.13" });
    expect(c.desglose[1]).toMatchObject({ cuota: "3.33", cuotaRecargo: "0.47" });
  });
  it("CRUD, pago, adjuntos (límite y tipo) y búsqueda", () => {
    const g = s.guardarGasto(oid, { proveedorNombre: "Luz SA", proveedorNif: "A58818501", fecha: "2026-03-02", numero: "L-77", concepto: "Electricidad", categoria: "suministros", desglose: [{ base: "80", tipo: "21" }] });
    expect(g).toMatchObject({ baseTotal: "80.00", cuotaTotal: "16.80", total: "96.80", estadoPago: "pendiente" });
    s.anadirAdjunto(oid, "gasto", g.id, { nombre: "ticket.pdf", mime: "application/pdf", datos: new Uint8Array([37, 80, 68, 70]) });
    expect(s.gasto(g.id)!.adjuntos).toBe(1);
    expect(s.adjuntoDatos(s.adjuntos("gasto", g.id)[0]!.id)!.datos).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(() => s.anadirAdjunto(oid, "gasto", g.id, { nombre: "x.exe", mime: "application/x-msdownload", datos: new Uint8Array(1) })).toThrow(/no admitido/);
    expect(() => s.anadirAdjunto(oid, "gasto", g.id, { nombre: "x.pdf", mime: "application/pdf", datos: new Uint8Array(10 * 1024 * 1024 + 1) })).toThrow(/10 MB/);
    s.marcarGastoPagado(g.id, "2026-03-05");
    expect(s.gasto(g.id)).toMatchObject({ estadoPago: "pagado", fechaPago: "2026-03-05" });
    expect(s.gastos(oid, { buscar: "Luz" })).toHaveLength(1);
    expect(() => s.guardarGasto(oid, { proveedorNombre: "X", proveedorNif: "12345678A", fecha: "2026-03-02", concepto: "x", desglose: [{ base: "1", tipo: "21" }] })).toThrow(/NIF/);
    s.eliminarGasto(g.id);
    expect(s.gastos(oid)).toHaveLength(0);
  });
});

describe("Presupuestos, albaranes y facturación agrupada", () => {
  it("presupuesto → albarán → factura; agrupar albaranes del mismo cliente", async () => {
    const p = s.guardarDocumento(oid, { clase: "presupuesto", borrador: b(), validez: "2026-04-10" });
    expect(p).toMatchObject({ numero: "P-2026-0001", total: "605.00", estado: "abierto" });
    const a1 = s.convertirEnAlbaran(p.id);
    expect(a1.numero).toBe("AL-2026-0001");
    expect(s.documento(p.id)!.estado).toBe("aceptado");
    const a2 = s.guardarDocumento(oid, { clase: "albaran", borrador: b({ lineas: [{ descripcion: "Material", cantidad: "1", precioUnitario: "100", tipo: "21" }] }) });
    const f = await s.facturarDocumentos(oid, serie, [a1.id, a2.id]);
    expect(f.totales.importeTotal).toBe("726.00");
    expect(f.datos.lineas.map((l) => l.descripcion)).toEqual(["Hora (AL-2026-0001)", "Material (AL-2026-0002)"]);
    expect(f.datos.descripcionOperacion).toBe("Según AL-2026-0001, AL-2026-0002");
    expect([s.documento(a1.id)!.estado, s.documento(a2.id)!.estado, s.documento(p.id)!.estado]).toEqual(["facturado", "facturado", "facturado"]);
    await expect(s.facturarDocumentos(oid, serie, [a1.id])).rejects.toThrow(/ya está facturado/);
    expect(() => s.guardarDocumento(oid, { id: a1.id, clase: "albaran", borrador: b() })).toThrow(/facturado/);
  });
  it("no agrupa documentos de clientes distintos", async () => {
    const x = s.guardarDocumento(oid, { clase: "albaran", borrador: b() });
    const y = s.guardarDocumento(oid, { clase: "albaran", borrador: b({ terceroId: cli2 }) });
    await expect(s.facturarDocumentos(oid, serie, [x.id, y.id])).rejects.toThrow(/mismo cliente/);
  });
});

describe("Facturas recurrentes", () => {
  it("sumarMeses ajusta fin de mes", () => {
    expect(sumarMeses("2026-01-31", 1)).toBe("2026-02-28");
    expect(sumarMeses("2026-11-15", 3)).toBe("2027-02-15");
  });
  it("borrador si no se emite automáticamente; emisión automática con fecha de hoy; avanza la próxima fecha", async () => {
    s.guardarRecurrencia(oid, { nombre: "Cuota mantenimiento", serieId: serie, borrador: b(), periodicidad: "mensual", proxima: "2026-02-01", autoEmitir: false });
    s.guardarRecurrencia(oid, { nombre: "Hosting", serieId: serie, borrador: b({ lineas: [{ descripcion: "Hosting", cantidad: "1", precioUnitario: "20", tipo: "21" }] }), periodicidad: "trimestral", proxima: "2026-03-10", autoEmitir: true });
    const r = await s.procesarRecurrentes(oid);
    expect(r.errores).toEqual([]);
    expect(r.borradores).toHaveLength(1);                      // aunque se saltó un mes, genera un único borrador
    expect(r.borradores[0]!.clase).toBe("borrador");
    expect(r.emitidas).toHaveLength(1);
    expect(r.emitidas[0]!.fechaExpedicion).toBe("2026-03-10");
    expect(s.recurrencias(oid).map((x) => x.proxima).sort()).toEqual(["2026-04-01", "2026-06-10"]);
    expect((await s.procesarRecurrentes(oid)).emitidas).toHaveLength(0); // idempotente
  });
});

describe("Cobros, impagos y recordatorios", () => {
  it("cobros parciales y totales actualizan el estado", async () => {
    const f = await s.emitir(oid, serie, b({ retencionPct: "15" }));   // 605 − 75 = 530 a pagar
    expect(s.pendienteDeCobro(f.id)).toBe("530.00");
    s.registrarCobro(f.id, { fecha: "2026-03-11", importe: "200" });
    expect(s.factura(f.id)!.estadoCobro).toBe("parcial");
    const c2 = s.registrarCobro(f.id, { fecha: "2026-03-12", importe: "330" });
    expect(s.factura(f.id)!.estadoCobro).toBe("cobrada");
    s.eliminarCobro(c2.id);
    expect(s.factura(f.id)!.estadoCobro).toBe("parcial");
  });
  it("vencidas (30 días por defecto) y texto de recordatorio", async () => {
    const f = await s.emitir(oid, serie, b());
    reloj = new Date("2026-04-20T09:00:00Z");
    const v = s.facturasVencidas(oid);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ id: f.id, vencimiento: "2026-04-09", diasVencida: 11, pendiente: "605.00", recordatorios: 0 });
    s.registrarRecordatorio(f.id, "email");
    expect(s.facturasVencidas(oid)[0]!.recordatorios).toBe(1);
    const t = textoRecordatorio(s.factura(f.id)!, "Estudio Lunar SL", "ES91 2100", 11);
    expect(t.asunto).toContain("A-2026-0001");
    expect(t.cuerpo).toContain("vencida hace 11 días");
  });
});

describe("Conciliación bancaria", () => {
  it("importa sin duplicar, sugiere por importe y número, concilia factura y gasto", async () => {
    const f1 = await s.emitir(oid, serie, b());
    const f2 = await s.emitir(oid, serie, b({ terceroId: cli2 }));
    const g = s.guardarGasto(oid, { proveedorNombre: "Hosting Galáctico SL", fecha: "2026-03-01", concepto: "Servidor", desglose: [{ base: "50", tipo: "21" }] });
    const ext = [
      { fecha: "2026-03-12", concepto: `TRANSF CLIENTE UNO ${f1.numSerie}`, importe: "605.00" },
      { fecha: "2026-03-13", concepto: "TRANSF OTRO CLIENTE SA", importe: "605.00" },
      { fecha: "2026-03-14", concepto: "RECIBO HOSTING GALACTICO", importe: "-60.50" },
      { fecha: "2026-03-14", concepto: "COMISION", importe: "-2.00" },
    ];
    expect(s.importarMovimientos(oid, ext)).toEqual({ nuevos: 4, duplicados: 0 });
    expect(s.importarMovimientos(oid, ext)).toEqual({ nuevos: 0, duplicados: 4 });
    const sug = s.sugerenciasConciliacion(oid);
    expect(sug.find((x) => x.tipo === "factura" && x.id === f1.id)?.confianza).toBe("alta");
    expect(sug.find((x) => x.tipo === "gasto")?.id).toBe(g.id);
    for (const x of sug) s.conciliar(x.movimientoId, x.tipo === "factura" ? { facturaId: x.id } : { gastoId: x.id });
    expect(s.factura(f1.id)!.estadoCobro).toBe("cobrada");
    expect(s.gasto(g.id)!.estadoPago).toBe("pagado");
    expect(s.movimientos(oid, true).map((m) => m.concepto)).toEqual(expect.arrayContaining(["COMISION"]));
    expect(() => s.conciliar(sug[0]!.movimientoId, { facturaId: f2.id })).toThrow(/ya está conciliado/);
  });
});
