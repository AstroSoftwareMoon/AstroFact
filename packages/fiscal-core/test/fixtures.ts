import type { FacturaBorrador, SistemaInformatico } from "../src";

export const SISTEMA: SistemaInformatico = {
  NombreRazon: "PRODUCTOR DE PRUEBAS", NIF: "89890001K",
  NombreSistemaInformatico: "AstroFact", IdSistemaInformatico: "AF", Version: "0.1.0",
  NumeroInstalacion: "TEST-0001", TipoUsoPosibleSoloVerifactu: "N", TipoUsoPosibleMultiOT: "S", IndicadorMultiplesOT: "N",
};

export const EMISOR = { nombre: "Empresa de Pruebas SL", nif: "89890001K" };
export const CLIENTE = { nombre: "Cliente de Pruebas", nif: "89890002E" };

/** Reproduce el desglose del ejemplo oficial de alta (Descripción SW 9.1.1.1): 10 al 4 % + 100 al 21 %. */
export function facturaEjemplo(over: Partial<FacturaBorrador> = {}): FacturaBorrador {
  return {
    tipoFactura: "F1", numSerie: "A-2025-0001", fechaExpedicion: "2025-02-03",
    emisor: EMISOR, destinatarios: [CLIENTE], descripcionOperacion: "Servicios de pruebas",
    lineas: [
      { descripcion: "Libro", cantidad: "1", precioUnitario: "10", tipo: "4" },
      { descripcion: "Consultoría", cantidad: "2", precioUnitario: "50", tipo: "21" },
    ],
    ...over,
  };
}
