import { it } from "vitest";
import { writeFileSync } from "node:fs";
import { generarFacturaPdf } from "../src";
import { datosMuestra } from "./muestra";
it.skipIf(!process.env.MUESTRAS)("genera muestras", async () => {
  for (const estilo of ["moderna", "clasica", "minimal"] as const)
    writeFileSync(`${process.env.MUESTRAS}/${estilo}.pdf`, await generarFacturaPdf(datosMuestra(estilo === "clasica" ? "verifactu" : "no_verifactu"), { estilo, colorAcento: estilo === "moderna" ? "#6C63FF" : "#0B7285", pieLegal: "Estudio Lunar SL · Inscrita en el Registro Mercantil de Madrid, tomo 12345, folio 67, hoja M-890123", notas: "Gracias por confiar en nosotros." }));
  writeFileSync(`${process.env.MUESTRAS}/ejemplo-pruebas.pdf`, await generarFacturaPdf({ ...datosMuestra("no_verifactu"), dePruebas: true }, { estilo: "moderna", notas: "Factura de ejemplo generada por los tests de AstroFact (entorno de pruebas de la AEAT)." }));
});
