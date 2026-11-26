import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { AstroFactStore, MIGRACIONES } from "../src";
import { sqljsDriver } from "../src/drivers/sqljs";
import { tx } from "../src/driver";

let reloj = new Date("2026-11-26T10:00:00+01:00");
const linea = { descripcion: "Diseño", cantidad: "1", precioUnitario: "100", tipo: "21" };

describe("modalidad «solo facturas» (sin registros)", () => {
  it("emite sin certificado, sin registro ni QR; anula; y pasa a No VERI*FACTU sin vuelta atrás", async () => {
    const s = new AstroFactStore(sqljsDriver(await initSqlJs()), { ahora: () => reloj });
    const o = s.crearObligado({ nif: "89890001K", nombre: "Estudio Lunar SL", territorio: "peninsula", modo: "sin_registros", entorno: "pruebas" });
    const serie = s.crearSerie(o.id, { codigo: "A", plantilla: "{serie}-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true });
    const cli = s.guardarTercero(o.id, { nombre: "Cliente SL", nif: "B12345674" });
    await s.arranque(o.id);
    const f = await s.emitir(o.id, serie.id, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Servicio", lineas: [linea] });
    expect(f.numSerie).toBe("A-2026-0001");
    expect(f.qrUrl).toBe("");
    expect(f.totales.importeTotal).toBe("121.00");
    expect(s.registros(o.id)).toEqual([]);
    expect(s.eventos(o.id)).toEqual([]);
    const f2 = await s.emitir(o.id, serie.id, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Otro", lineas: [linea] });
    expect(f2.numSerie).toBe("A-2026-0002");
    await s.anular(f2.id, "error");
    expect(s.factura(f2.id)!.anulada).toBe(true);
    expect(s.registros(o.id)).toEqual([]);
    // Paso a No VERI*FACTU: exige certificado
    await expect(s.activarRegistros(o.id)).rejects.toThrow(/certificado/);
    await s.generarCertificadoPruebas(o.id, "clave-pruebas");
    await s.activarRegistros(o.id);
    expect(s.obligado(o.id)!.modo).toBe("no_verifactu");
    reloj = new Date(reloj.getTime() + 60_000);
    const f3 = await s.emitir(o.id, serie.id, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Con registro", lineas: [linea] });
    expect(f3.numSerie).toBe("A-2026-0003");
    expect(f3.qrUrl).toMatch(/^https:\/\//);
    expect(s.registros(o.id)).toHaveLength(1);
    expect((await s.verificarIntegridad(o.id)).facturacion.ok).toBe(true);
  });

  it("la migración 4 conserva los datos de una base de datos anterior", async () => {
    const SQL = await initSqlJs();
    const d = sqljsDriver(SQL);
    d.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, nombre TEXT, aplicada_en TEXT NOT NULL)");
    for (const m of MIGRACIONES.filter((x) => x.version < 4)) tx(d, () => { d.exec(m.sql); d.run("INSERT INTO schema_migrations VALUES (?,?,?)", [m.version, m.nombre, "2026-01-01"]); });
    d.run("INSERT INTO obligado (nif, nombre, territorio, modo, entorno, creado_en) VALUES ('89890001K','Antiguo SL','peninsula','no_verifactu','pruebas','2026-01-01')");
    d.run("INSERT INTO serie (obligado_id, codigo, plantilla, clase, reinicio_anual, ultimo_numero, activa) VALUES (1,'A','{serie}-{num:4}','ordinaria',1,7,1)");
    const s = new AstroFactStore(d, { ahora: () => reloj });
    expect(s.obligado()).toMatchObject({ nombre: "Antiguo SL", modo: "no_verifactu" });
    expect(s.series(1)[0]!.ultimoNumero).toBe(7);
    expect(d.all("PRAGMA foreign_key_check")).toEqual([]);
    expect(d.get<{ foreign_keys: number }>("PRAGMA foreign_keys")?.foreign_keys).toBe(1);
  });
});
