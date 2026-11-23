/**
 * Mensaje SOAP RegFactuSistemaFacturacion (SuministroLR.xsd) para la remisión VERI*FACTU
 * y la remisión bajo requerimiento. Ver "Descripción del servicio web" v1.0.3, apdo. 9.
 * El transporte (HTTPS con certificado cliente) vive fuera del núcleo (apps/server, apps/client).
 */
import { LIMITES, NS } from "../constants";
import { el, opt, serialize, XML_DECL, type XmlNode } from "../xml/writer";
import { registroAltaNode, registroAnulacionNode } from "../records/xml";
import type { PersonaFisicaJuridicaES, RegistroFacturacion } from "../records/types";

export interface Cabecera {
  ObligadoEmision: PersonaFisicaJuridicaES;
  Representante?: PersonaFisicaJuridicaES;
  RemisionVoluntaria?: { FechaFinVeriFactu?: string; Incidencia?: "S" | "N" };
  RemisionRequerimiento?: { RefRequerimiento: string; FinRequerimiento?: "S" | "N" };
}

const s1 = (n: string) => `sum1:${n}`;
const per = (name: string, p: PersonaFisicaJuridicaES) => el(s1(name), el(s1("NombreRazon"), p.NombreRazon), el(s1("NIF"), p.NIF));

export function cabeceraNode(c: Cabecera): XmlNode {
  return el("sum:Cabecera",
    per("ObligadoEmision", c.ObligadoEmision),
    c.Representante ? per("Representante", c.Representante) : null,
    c.RemisionVoluntaria ? el(s1("RemisionVoluntaria"), opt(s1("FechaFinVeriFactu"), c.RemisionVoluntaria.FechaFinVeriFactu), opt(s1("Incidencia"), c.RemisionVoluntaria.Incidencia)) : null,
    c.RemisionRequerimiento ? el(s1("RemisionRequerimiento"), el(s1("RefRequerimiento"), c.RemisionRequerimiento.RefRequerimiento), opt(s1("FinRequerimiento"), c.RemisionRequerimiento.FinRequerimiento)) : null);
}

/** Nodo RegFactuSistemaFacturacion (1–1000 registros). */
export function regFactuNode(cab: Cabecera, regs: RegistroFacturacion[], withNs = false): XmlNode {
  if (regs.length < 1 || regs.length > LIMITES.registrosPorEnvio) throw new RangeError(`Un envío admite de 1 a ${LIMITES.registrosPorEnvio} registros`);
  for (const r of regs) {
    const nif = r.tipo === "alta" ? r.registro.IDFactura.IDEmisorFactura : r.registro.IDFactura.IDEmisorFacturaAnulada;
    if (nif !== cab.ObligadoEmision.NIF) throw new Error("El NIF del emisor de cada registro debe coincidir con ObligadoEmision (Validaciones 3.1.3.1)");
  }
  const node = el("sum:RegFactuSistemaFacturacion",
    cabeceraNode(cab),
    ...regs.map((r) => el("sum:RegistroFactura", r.tipo === "alta" ? registroAltaNode(r.registro) : registroAnulacionNode(r.registro))));
  if (withNs) node.attrs = { "xmlns:sum": NS.SuministroLR, "xmlns:sum1": NS.SuministroInformacion };
  return node;
}

/** Documento XML RegFactuSistemaFacturacion autónomo (útil para validar contra XSD y para exportar). */
export const regFactuXml = (cab: Cabecera, regs: RegistroFacturacion[]) => `${XML_DECL}\n${serialize(regFactuNode(cab, regs, true))}\n`;

/** Sobre SOAP 1.1 completo. */
export function sobreSoap(cab: Cabecera, regs: RegistroFacturacion[]): string {
  const env = el("soapenv:Envelope", { "xmlns:soapenv": NS.soapenv, "xmlns:sum": NS.SuministroLR, "xmlns:sum1": NS.SuministroInformacion },
    el("soapenv:Header"),
    el("soapenv:Body", regFactuNode(cab, regs)));
  return `${XML_DECL}\n${serialize(env)}\n`;
}
