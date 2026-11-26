import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { calcularTotales, type LineaFactura } from "@astrofact/fiscal-core";
import {
  libroEmitidas, libroRecibidas, resumenIva, pagoFraccionado130, ventasPorCliente, ventasPorMes,
  aXlsx, leerXlsx, aCsv, leerCsv, crearZip, leerZip, importarClientes, importarProductos, generarFacturae,
  trimestreRango, type FacturaInf, type GastoInf,
} from "../src";

let nid = 1;
function factura(fecha: string, lineas: LineaFactura[], extra: Partial<FacturaInf> & { retencionPct?: string; cliente?: string } = {}): FacturaInf {
  const t = calcularTotales({ lineas, retencionPct: extra.retencionPct });
  const s = (d: { toFixed(n: number): string }) => d.toFixed(2);
  return {
    id: nid, numSerie: extra.numSerie ?? `F-${nid++}`, fechaExpedicion: fecha, tipoFactura: "F1", anulada: false, terceroId: 1,
    datos: { lineas, descripcionOperacion: "Servicios", retencionPct: extra.retencionPct, emisor: { nif: "B12345674", nombre: "Astro SL" } as any,
      destinatarios: [{ nif: extra.cliente ? "B12345670" : "12345678Z", nombre: extra.cliente ?? "Ana Pérez López" }] as any },
    totales: {
      baseTotal: s(t.baseTotal), cuotaTotal: s(t.cuotaTotal), importeTotal: s(t.importeTotal), retencion: s(t.retencion), totalAPagar: s(t.totalAPagar),
      desglose: t.desglose.map((g) => ({ impuesto: g.impuesto, calificacion: g.calificacion, exenta: g.exenta, tipo: g.tipo?.toPlain(), recargo: g.recargo?.toPlain(), base: s(g.base), cuota: s(g.cuota), cuotaRecargo: s(g.cuotaRecargo) })),
      lineas: t.lineas.map((l) => ({ base: s(l.base) })),
    },
    ...extra,
  };
}
const gasto = (fecha: string, base: string, tipo: string, extra: Partial<GastoInf> = {}): GastoInf => {
  const cuota = (Number(base) * Number(tipo) / 100).toFixed(2);
  return { id: nid++, proveedorNombre: "Proveedor SA", proveedorNif: "B12345670", fecha, concepto: "Material", categoria: "suministros",
    desglose: [{ base, tipo, cuota, recargo: "0", cuotaRecargo: "0.00" }], baseTotal: base, cuotaTotal: cuota, retencion: "0.00",
    total: (Number(base) + Number(cuota)).toFixed(2), pctDeducible: "100", inversionSujetoPasivo: false, ...extra };
};

const F = [
  factura("2026-01-15", [{ descripcion: "Diseño web", cantidad: "1", precioUnitario: "1000", tipo: "21" }], { retencionPct: "15" }),
  factura("2026-02-10", [{ descripcion: "Libro", cantidad: "2", precioUnitario: "50", tipo: "4" }, { descripcion: "Curso", cantidad: "1", precioUnitario: "200", exenta: "E1" }], { cliente: "Beta SL" }),
  factura("2026-04-02", [{ descripcion: "Mantenimiento", cantidad: "3", precioUnitario: "100", tipo: "21" }]),
  { ...factura("2026-03-01", [{ descripcion: "Anulada", cantidad: "1", precioUnitario: "999", tipo: "21" }]), anulada: true },
];
const G = [gasto("2026-01-20", "200", "21"), gasto("2026-03-05", "100", "21", { pctDeducible: "50" }), gasto("2026-05-01", "80", "10")];

describe("libros", () => {
  it("libro de emitidas: una fila por grupo de impuesto, sin anuladas", () => {
    const { desde, hasta } = trimestreRango(2026, 1);
    const h = libroEmitidas(F, desde, hasta);
    expect(h.filas.length).toBe(3);
    expect(h.filas.some((f) => f.includes("Anulada"))).toBe(false);
  });
  it("libro de recibidas filtra por periodo", () => {
    expect(libroRecibidas(G, "2026-01-01", "2026-03-31").filas.length).toBe(2);
  });
});

describe("resumen de IVA (orientativo)", () => {
  it("devengado, exentas, deducible con prorrata de afectación", () => {
    const r = resumenIva(F, G, "2026-01-01", "2026-03-31");
    expect(r.devengado).toEqual([{ tipo: "21", base: "1000.00", cuota: "210.00" }, { tipo: "4", base: "100.00", cuota: "4.00" }]);
    expect(r.exentasYNoSujetas).toEqual([{ concepto: "Exentas (E1)", base: "200.00" }]);
    expect(r.totalDevengado).toBe("214.00");
    // 42 (200×21%) + 10.50 (50 % de 21)
    expect(r.totalDeducible).toBe("52.50");
    expect(r.cuotaNoDeducible).toBe("10.50");
    expect(r.resultado).toBe("161.50");
  });
  it("inversión del sujeto pasivo: se devenga y se deduce", () => {
    const r = resumenIva([], [gasto("2026-02-01", "1000", "21", { inversionSujetoPasivo: true, cuotaTotal: "0.00" })], "2026-01-01", "2026-03-31");
    expect(r.inversionSujetoPasivo).toEqual({ base: "1000.00", cuota: "210.00" });
    expect(r.resultado).toBe("0.00");
  });
});

describe("pago fraccionado (modelo 130, orientativo)", () => {
  it("20 % del rendimiento neto acumulado menos retenciones y pagos anteriores", () => {
    const t1 = pagoFraccionado130(F, G, { anio: 2026, trimestre: 1, profesional: true });
    // ingresos 1000+300 = 1300; gastos 200 + 50 + 10.50 (IVA no deducible) = 260.50
    expect(t1.ingresos).toBe("1300.00");
    expect(t1.gastos).toBe("260.50");
    expect(t1.rendimientoNeto).toBe("1039.50");
    expect(t1.veintePorCiento).toBe("207.90");
    expect(t1.retenciones).toBe("150.00");
    expect(t1.aIngresar).toBe("57.90");
    const t2 = pagoFraccionado130(F, G, { anio: 2026, trimestre: 2, pagosAnteriores: t1.aIngresar, simplificada: true });
    expect(t2.ingresos).toBe("1600.00");
    expect(t2.difJustificacion).toBe("62.98"); // 5 % de (1600 − 340.50) = 62.975 → 62.98
  });
  it("tope de 2.000 € en difícil justificación", () => {
    const grande = factura("2026-03-01", [{ descripcion: "Proyecto", cantidad: "1", precioUnitario: "100000", tipo: "21" }]);
    expect(pagoFraccionado130([grande], [], { anio: 2026, trimestre: 1, simplificada: true }).difJustificacion).toBe("2000.00");
  });
});

describe("ventas", () => {
  it("por cliente y por mes", () => {
    const v = ventasPorCliente(F, "2026-01-01", "2026-12-31");
    expect(v.length).toBe(2);
    expect(ventasPorMes(F, 2026).find((m) => m.mes === 2)?.base).toBe("300.00");
  });
});

describe("hojas y zip", () => {
  it("XLSX ida y vuelta", async () => {
    const h = libroEmitidas(F, "2026-01-01", "2026-12-31");
    const bytes = aXlsx([h]);
    const filas = await leerXlsx(bytes);
    expect(filas[0]).toEqual(h.columnas);
    expect(filas.length).toBe(h.filas.length + 1);
    const otra = await leerXlsx(aXlsx([{ nombre: "Otra & <hoja>", columnas: ["a"], filas: [["ñ€\"<>&amp;"]] }]));
    expect(otra[1]![0]).toBe("ñ€\"<>&amp;");
  });
  it("CSV con separador ; y comillas", () => {
    const csv = aCsv({ nombre: "x", columnas: ["Nombre", "Importe"], filas: [["Pérez; \"Ana\"", 12.5]] });
    expect(csv).toContain("12,5");
    const filas = leerCsv(csv);
    expect(filas[1]![0]).toBe("Pérez; \"Ana\"");
  });
  it("zip ida y vuelta", async () => {
    const z = crearZip([{ nombre: "a/b.txt", contenido: "hola" }]);
    const r = await leerZip(z);
    expect(new TextDecoder().decode(r.get("a/b.txt")!)).toBe("hola");
  });
});

describe("importación", () => {
  it("clientes: sinónimos de cabecera, NIF inválido y duplicados", () => {
    const r = importarClientes([["Razón social", "CIF", "E-mail", "C.P.", "Población"], ["Beta SL", "B12345674", "a@b.es", "28001", "Madrid"], ["Malo", "B12345675", "", "", ""], ["Beta bis", "B12345674", "", "", ""]]);
    expect(r.validos.length).toBe(1);
    expect(r.validos[0]!.direccion?.cp).toBe("28001");
    expect(r.errores.length).toBe(2);
  });
  it("productos: precio con coma decimal", () => {
    const r = importarProductos([["Descripción", "Precio", "IVA"], ["Hora de consultoría", "45,50", "21%"]]);
    expect(r.validos[0]).toMatchObject({ precio: "45.5", tipo: "21" });
  });
});

describe("Facturae 3.2.2", () => {
  const xsd = resolve(__dirname, "../../../docs/normativa/facturae/Facturaev3_2_2.xsd");
  const validar = (xml: string) => {
    const d = mkdtempSync(join(tmpdir(), "fe-")); const p = join(d, "f.xml"); writeFileSync(p, xml);
    return execFileSync("xmllint", ["--noout", "--schema", xsd, p], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  };
  const emisor = { nombre: "Astro SL", nif: "B12345674", direccion: { linea1: "Calle Mayor 1", cp: "28013", municipio: "Madrid" } };
  const receptor = { nombre: "Ana Pérez López", nif: "12345678Z", direccion: { linea1: "Av. Sol 2", cp: "41001", municipio: "Sevilla" }, email: "ana@example.com" };
  it("factura con retención, descuento, exenta y recargo valida contra el XSD oficial", () => {
    const f = factura("2026-01-15", [
      { descripcion: "Diseño", cantidad: "2", precioUnitario: "100", descuentoPct: "10", tipo: "21" },
      { descripcion: "Formación", cantidad: "1", precioUnitario: "50", exenta: "E1" },
      { descripcion: "Material", cantidad: "1", precioUnitario: "10", tipo: "21", recargo: "5.2" },
    ], { retencionPct: "15" });
    const xml = generarFacturae(f, emisor, receptor, { iban: "ES91 2100 0418 4502 0005 1332", vencimiento: "2026-02-15" });
    expect(() => validar(xml)).not.toThrow();
    expect(xml).toContain("<Individual><Name>Ana</Name><FirstSurname>Pérez</FirstSurname>");
    expect(xml).toContain("<InvoiceTotal>");
  });
  it("rectificativa a Administración Pública con DIR3 y receptor extranjero", () => {
    const f = { ...factura("2026-03-01", [{ descripcion: "Abono", cantidad: "-1", precioUnitario: "100", tipo: "21" }]), tipoFactura: "R1" };
    f.datos = { ...f.datos, rectificacion: { tipo: "I", facturas: [{ IDEmisorFactura: "B12345674", NumSerieFactura: "F-1", FechaExpedicionFactura: "15-01-2026" }] } as any };
    validar(generarFacturae(f, emisor, { nombre: "Ayuntamiento", nif: "P2800000A", direccion: { linea1: "Plaza 1", cp: "28001", municipio: "Madrid" } }, { dir3: { oficinaContable: "L01280796", organoGestor: "L01280796", unidadTramitadora: "L01280796" } }));
    validar(generarFacturae(f, emisor, { nombre: "Acme GmbH", idOtro: { codigoPais: "DE", id: "DE123456789" }, direccion: { linea1: "Hauptstr. 1", cp: "10115", municipio: "Berlin", pais: "DE" } }));
  });
  it("exige dirección del receptor", () => {
    expect(() => generarFacturae(F[0]!, emisor, { nombre: "X", nif: "12345678Z" })).toThrow(/dirección/);
  });
});
