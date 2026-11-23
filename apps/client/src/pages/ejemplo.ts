import type { AstroFactStore, BorradorUI } from "@astrofact/db";

/** Crea (si no existe) un cliente y un producto de ejemplo y devuelve un borrador SIN emitir. */
export function ejemploFactura(store: AstroFactStore): BorradorUI {
  const o = store.obligado()!;
  const cli = store.terceros(o.id, "Cliente de Ejemplo")[0] ?? store.guardarTercero(o.id, { nombre: "Cliente de Ejemplo SL", nif: "B12345674", email: "facturas@example.com",
    direccion: { linea1: "Av. de las Estrellas 42", cp: "28010", municipio: "Madrid", provincia: "Madrid", pais: "España" } });
  const p = store.productos(o.id, "Diseño")[0] ?? store.guardarProducto(o.id, { nombre: "Diseño de logotipo", precio: "450", tipo: "21" });
  store.productos(o.id, "Hora").length || store.guardarProducto(o.id, { nombre: "Hora de consultoría", precio: "60", tipo: "21" });
  return {
    tipoFactura: "F1", terceroId: cli.id, descripcionOperacion: "Servicios de diseño y consultoría",
    lineas: [{ descripcion: p.nombre, cantidad: "1", precioUnitario: p.precio, tipo: "21" }, { descripcion: "Hora de consultoría", cantidad: "3", precioUnitario: "60", tipo: "21" }],
    retencionPct: "15",
  };
}
