/**
 * Exportación de registros (art. 8.2 y 8.5 Orden): copia fidedigna, legible, con la estructura
 * de los arts. 10 y 11. Se exporta en ficheros RegFactuSistemaFacturacion (válidos contra
 * SuministroLR.xsd) de hasta 1000 registros, más los registros individuales firmados si existen.
 * TODO(normativa): la Orden no fija un contenedor específico para la exportación; se usa el
 * esquema oficial de remisión por ser el formato legible y validable publicado por la AEAT.
 */
import { LIMITES } from "./constants";
import { D, fmtImporte, sum } from "./decimal";
import { cabezaDe } from "./records/build";
import type { PersonaFisicaJuridicaES, RegistroFacturacion } from "./records/types";
import { regFactuXml } from "./aeat/soap";

export interface ResultadoExportacion {
  ficheros: { nombre: string; contenido: string }[];
  resumen: {
    numAltas: number; numAnulaciones: number; sumaCuotaTotalAlta: string; sumaImporteTotalAlta: string;
    inicial?: ReturnType<typeof cabezaDe>; final?: ReturnType<typeof cabezaDe>;
  };
}

export function exportarRegistros(obligado: PersonaFisicaJuridicaES, regs: RegistroFacturacion[], prefijo = "registros"): ResultadoExportacion {
  const ficheros: ResultadoExportacion["ficheros"] = [];
  for (let i = 0; i < regs.length; i += LIMITES.registrosPorEnvio) {
    const lote = regs.slice(i, i + LIMITES.registrosPorEnvio);
    ficheros.push({ nombre: `${prefijo}-${String(i / LIMITES.registrosPorEnvio + 1).padStart(4, "0")}.xml`, contenido: regFactuXml({ ObligadoEmision: obligado }, lote) });
  }
  const altas = regs.filter((r) => r.tipo === "alta").map((r) => r.registro as { CuotaTotal: string; ImporteTotal: string });
  return {
    ficheros,
    resumen: {
      numAltas: altas.length,
      numAnulaciones: regs.length - altas.length,
      sumaCuotaTotalAlta: fmtImporte(sum(altas.map((a) => D(a.CuotaTotal)))),
      sumaImporteTotalAlta: fmtImporte(sum(altas.map((a) => D(a.ImporteTotal)))),
      inicial: regs[0] ? cabezaDe(regs[0]) : undefined,
      final: regs.length ? cabezaDe(regs[regs.length - 1]!) : undefined,
    },
  };
}
