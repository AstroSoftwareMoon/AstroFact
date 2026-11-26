import { calcularTotales, urlQr, type FacturaBorrador } from "@astrofact/fiscal-core";
import { totalesAJson, type Factura, type Obligado } from "@astrofact/db";

/** Factura ficticia para la vista previa de plantillas (no se guarda ni genera registros). */
export function facturaMuestra(o: Obligado): Factura {
  const datos: FacturaBorrador = {
    tipoFactura: "F1", numSerie: "A-0000-0001", fechaExpedicion: new Date().toISOString().slice(0, 10), descripcionOperacion: "Vista previa de la plantilla",
    emisor: { nombre: o.nombre, nif: o.nif }, destinatarios: [{ nombre: "Cliente de muestra SL", nif: "B12345674", direccion: { linea1: "Av. de las Estrellas 42", cp: "28010", municipio: "Madrid" } }],
    lineas: [{ descripcion: "Diseño de logotipo", cantidad: "1", precioUnitario: "450", tipo: "21" }, { descripcion: "Hora de consultoría", cantidad: "3", precioUnitario: "60", tipo: "21" }], retencionPct: "15",
  };
  const t = calcularTotales(datos);
  return { id: 0, obligadoId: o.id, serieId: 0, numero: 1, numSerie: datos.numSerie, fechaExpedicion: datos.fechaExpedicion, tipoFactura: "F1", datos, totales: totalesAJson(t),
    qrUrl: o.modo === "sin_registros" ? "" : urlQr({ nif: o.nif, numSerie: datos.numSerie, fechaExpedicion: "01-01-2026", importeTotal: t.importeTotal.toFixed(2) }, { entorno: "pruebas", verifactu: o.modo === "verifactu" }),
    dePruebas: o.modo !== "sin_registros", estadoCobro: "pendiente", anulada: false, emitidaEn: new Date().toISOString() };
}
