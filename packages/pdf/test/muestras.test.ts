import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { ESTILOS, generarFacturaPdf } from "../src";
import { datosMuestra } from "./muestra";
it.skipIf(!process.env.MUESTRAS)("genera muestras", async () => {
  for (const { id: estilo, color } of ESTILOS)
    writeFileSync(`${process.env.MUESTRAS}/${estilo}.pdf`, await generarFacturaPdf(datosMuestra(estilo === "clasica" ? "verifactu" : estilo === "moderna" || estilo === "minimal" ? "no_verifactu" : "sin_registros"), { estilo, colorAcento: color, pieLegal: "Estudio Lunar SL · Inscrita en el Registro Mercantil de Madrid, tomo 12345, folio 67, hoja M-890123", notas: "Gracias por confiar en nosotros." }));
  for (const { id: estilo, color } of ESTILOS)
    writeFileSync(`${process.env.MUESTRAS}/solo-${estilo}.pdf`, await generarFacturaPdf({ ...datosMuestra("sin_registros"), qrUrl: "" }, { estilo, colorAcento: color, notas: "Gracias por confiar en nosotros." }));
  writeFileSync(`${process.env.MUESTRAS}/ejemplo-pruebas.pdf`, await generarFacturaPdf({ ...datosMuestra("no_verifactu"), dePruebas: true }, { estilo: "moderna", notas: "Factura de ejemplo generada por los tests de AstroFact (entorno de pruebas de la AEAT)." }));
});
