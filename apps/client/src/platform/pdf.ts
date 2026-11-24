import { generarFacturaPdf, type Plantilla } from "@astrofact/pdf";
import type { Factura, Obligado, PlantillaGuardada } from "@astrofact/db";

const deB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const aB64 = (u: Uint8Array) => { let s = ""; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

export function plantillaPdf(p: PlantillaGuardada): Partial<Plantilla> {
  return { estilo: p.estilo, colorAcento: p.colorAcento, pieLegal: p.pieLegal, notas: p.notas, mostrarIban: p.mostrarIban,
    logo: p.logoB64 && p.logoTipo ? { bytes: deB64(p.logoB64), tipo: p.logoTipo } : undefined };
}

export function pdfDeFactura(f: Factura, o: Obligado, p: PlantillaGuardada) {
  return generarFacturaPdf({
    numSerie: f.numSerie, fechaExpedicion: f.fechaExpedicion, fechaOperacion: f.fechaOperacion, vencimiento: f.vencimiento, tipoFactura: f.tipoFactura,
    datos: f.datos, totales: f.totales, qrUrl: f.qrUrl, dePruebas: f.dePruebas, anulada: f.anulada, modo: o.modo,
    emisor: { nombre: f.datos.emisor.nombre, nif: f.datos.emisor.nif, direccion: o.direccion, email: o.email, telefono: o.telefono, iban: o.iban },
  }, plantillaPdf(p));
}
