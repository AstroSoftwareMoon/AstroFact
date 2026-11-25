/**
 * @astrofact/fiscal-core — núcleo fiscal de AstroFact.
 * Aviso: este software no sustituye el asesoramiento fiscal profesional ni está
 * "certificado" ni "homologado" por la AEAT (no existe tal homologación: el productor
 * emite una declaración responsable, art. 15 Orden HAC/1177/2024).
 */
export * from "./constants";
export * from "./decimal";
export * from "./nif";
export * from "./dates";
export * from "./hash";
export * from "./qr";
export * from "./numbering";
export * from "./chain";
export * from "./events";
export * from "./export";
export * from "./signature";
export * from "./records/types";
export * from "./records/build";
export * from "./records/xml";
export * from "./invoice/types";
export * from "./invoice/calc";
export * from "./invoice/validate";
export * from "./aeat/soap";
export * from "./aeat/response";
export * from "./aeat/flow";
export { el, opt, serialize, escapeXml, toXmlDocument, type XmlNode } from "./xml/writer";
export * from "./aeat/operativa";
export * from "./aeat/errores";
