import { describe, expect, it } from "vitest";
import initSqlJs from "sql.js";
import { AstroFactStore, crearCopia, esCopiaAstro, evaluarRestauracion, leerCopia, registrarRestauracion } from "../src";
import { sqljsDriver } from "../src/drivers/sqljs";

let reloj = new Date("2026-03-10T10:00:00+01:00");
async function negocio() {
  const SQL = await initSqlJs();
  const d = sqljsDriver(SQL);
  const s = new AstroFactStore(d, { ahora: () => reloj });
  const o = s.crearObligado({ nif: "89890001K", nombre: "Taller Astro SL", territorio: "peninsula", modo: "no_verifactu", entorno: "pruebas" });
  const serie = s.crearSerie(o.id, { codigo: "A", plantilla: "{serie}-{año}-{num:4}", clase: "ordinaria", reinicioAnual: true });
  const cli = s.guardarTercero(o.id, { nombre: "Cliente SL", nif: "B12345674" });
  await s.generarCertificadoPruebas(o.id, "clave-pruebas");
  const emitir = () => { reloj = new Date(reloj.getTime() + 60_000); return s.emitir(o.id, serie.id, { tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Servicio", lineas: [{ descripcion: "Hora", cantidad: "1", precioUnitario: "50", tipo: "21" }] }); };
  return { SQL, d, s, o, emitir };
}
const abrir = async (SQL: Awaited<ReturnType<typeof initSqlJs>>, b: Uint8Array) => new AstroFactStore(sqljsDriver(SQL, b), { ahora: () => reloj });

describe("copias de seguridad .astro", () => {
  it("cifra, detecta contraseña errónea y daños, y conserva los datos", async () => {
    const { d, emitir } = await negocio(); await emitir();
    const c = await crearCopia(d.exportar(), "contraseña-copia", "0.7.0");
    expect(esCopiaAstro(c)).toBe(true);
    expect(new TextDecoder().decode(c)).not.toContain("Taller Astro");
    await expect(leerCopia(c, "otra-clave-mala")).rejects.toThrow(/Contraseña incorrecta/);
    const mala = c.slice(); mala[mala.length - 5]! ^= 1;
    await expect(leerCopia(mala, "contraseña-copia")).rejects.toThrow();
    const r = await leerCopia(c, "contraseña-copia");
    expect(r.manifiesto.version).toBe("0.7.0");
    await expect(crearCopia(d.exportar(), "corta", "0.7.0")).rejects.toThrow(/8 caracteres/);
  });

  it("solo permite restaurar sin perder registros y anota el evento 07", async () => {
    const { SQL, d, s, emitir } = await negocio();
    await emitir();
    const copia1 = (await leerCopia(await crearCopia(d.exportar(), "contraseña-copia", "0.7.0"), "contraseña-copia")).db;
    await emitir();
    // Copia anterior sobre datos con más registros → denegada
    expect(await evaluarRestauracion(s, await abrir(SQL, copia1))).toMatchObject({ permitida: false, caso: "anterior", registrosCopia: 1, registrosActuales: 2 });
    // Copia actual → permitida (igual); sobre instalación vacía → permitida
    const copia2 = d.exportar();
    expect(await evaluarRestauracion(s, await abrir(SQL, copia2))).toMatchObject({ permitida: true, caso: "igual" });
    expect(await evaluarRestauracion(undefined, await abrir(SQL, copia2))).toMatchObject({ permitida: true, caso: "vacio" });
    // Datos actuales más antiguos que la copia → recupera
    expect(await evaluarRestauracion(await abrir(SQL, copia1), await abrir(SQL, copia2))).toMatchObject({ permitida: true, caso: "recupera" });
    // Otra rama de la cadena (divergente)
    const rama = await abrir(SQL, copia1);
    const o = rama.obligado()!; await rama.desbloquearCertificado(o.id, "clave-pruebas");
    reloj = new Date(reloj.getTime() + 60_000);
    await rama.emitir(o.id, rama.series(o.id)[0]!.id, { tipoFactura: "F1", terceroId: rama.terceros(o.id)[0]!.id, descripcionOperacion: "Otra", lineas: [{ descripcion: "X", cantidad: "1", precioUnitario: "70", tipo: "21" }] });
    expect(await evaluarRestauracion(s, rama)).toMatchObject({ permitida: false, caso: "divergente" });
    // Evento de restauración
    const restaurada = await abrir(SQL, copia2);
    await restaurada.desbloquearCertificado(restaurada.obligado()!.id, "clave-pruebas");
    await registrarRestauracion(restaurada, { formato: 1, app: "AstroFact", version: "0.7.0", creada: "2026-03-10T09:00:00.000Z" });
    expect(restaurada.eventos(restaurada.obligado()!.id).some((e) => e.tipo === "07")).toBe(true);
  });
});
