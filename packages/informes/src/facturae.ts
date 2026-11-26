/**
 * Facturae 3.2.2 (módulo opcional, desactivado por defecto). Genera el XML SIN FIRMAR conforme al esquema
 * oficial (docs/normativa/facturae/Facturaev3_2_2.xsd). Para FACe/B2G debe firmarse con XAdES según la
 * política de firma Facturae v3.1: TODO(normativa #14) firma Facturae (requiere referencia a KeyInfo).
 */
import { D, Dec, sum, validateNif } from "@astrofact/fiscal-core";
import type { FacturaInf } from "./tipos";

export interface DireccionFacturae { linea1?: string; cp?: string; municipio?: string; provincia?: string; pais?: string; }
export interface ParteFacturae { nombre: string; nif?: string; idOtro?: { codigoPais?: string; id: string }; direccion?: DireccionFacturae; email?: string;
  /** Para personas físicas: nombre y apellidos separados (si no, se separan por espacios). */
  personaFisica?: { nombre: string; apellido1: string; apellido2?: string }; }
export interface OpcionesFacturae {
  /** Centros DIR3 (oficina contable, órgano gestor, unidad tramitadora) para facturas a Administraciones Públicas. */
  dir3?: { oficinaContable: string; organoGestor: string; unidadTramitadora: string };
  /** Rectificativas: código de motivo (ReasonCodeType). Por defecto "16" (base imponible). */
  motivoRectificacion?: string;
  iban?: string; vencimiento?: string;
}

const ISO3: Record<string, string> = { ES: "ESP", PT: "PRT", FR: "FRA", DE: "DEU", IT: "ITA", NL: "NLD", BE: "BEL", AT: "AUT", IE: "IRL", LU: "LUX", GB: "GBR", US: "USA", AD: "AND", CH: "CHE", DK: "DNK", SE: "SWE", FI: "FIN", PL: "POL", GR: "GRC", EL: "GRC", MX: "MEX", AR: "ARG" };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const t = (n: string, v: string | number | undefined | null) => (v === undefined || v === null || v === "" ? "" : `<${n}>${esc(String(v))}</${n}>`);
const cut = (s: string | undefined, n: number) => (s ?? "").slice(0, n);
const n2 = (d: Dec | string) => D(d).toFixed(2);
const n8 = (d: Dec | string) => { const s = D(d).round(8).toPlain(); return s.includes(".") ? s : `${s}.00`; };
const PROVINCIAS_CP: Record<string, string> = { "01": "Álava", "02": "Albacete", "03": "Alicante", "04": "Almería", "05": "Ávila", "06": "Badajoz", "07": "Illes Balears", "08": "Barcelona", "09": "Burgos", "10": "Cáceres", "11": "Cádiz", "12": "Castellón", "13": "Ciudad Real", "14": "Córdoba", "15": "A Coruña", "16": "Cuenca", "17": "Girona", "18": "Granada", "19": "Guadalajara", "20": "Gipuzkoa", "21": "Huelva", "22": "Huesca", "23": "Jaén", "24": "León", "25": "Lleida", "26": "La Rioja", "27": "Lugo", "28": "Madrid", "29": "Málaga", "30": "Murcia", "31": "Navarra", "32": "Ourense", "33": "Asturias", "34": "Palencia", "35": "Las Palmas", "36": "Pontevedra", "37": "Salamanca", "38": "Santa Cruz de Tenerife", "39": "Cantabria", "40": "Segovia", "41": "Sevilla", "42": "Soria", "43": "Tarragona", "44": "Teruel", "45": "Toledo", "46": "Valencia", "47": "Valladolid", "48": "Bizkaia", "49": "Zamora", "50": "Zaragoza", "51": "Ceuta", "52": "Melilla" };

function parte(p: ParteFacturae, rol: "emisor" | "receptor", dir3?: OpcionesFacturae["dir3"]): string {
  const espanol = !!p.nif;
  const id = p.nif ?? p.idOtro?.id;
  if (!id) throw new Error(`Facturae: el ${rol} necesita NIF o identificador fiscal`);
  const v = p.nif ? validateNif(p.nif) : undefined;
  const fisica = !!v && (v.kind === "DNI" || v.kind === "NIE" || v.kind === "KLM");
  const d = p.direccion ?? {};
  if (!d.linea1 || !d.cp || !d.municipio) throw new Error(`Facturae: faltan dirección, código postal o municipio del ${rol}`);
  const pais = (d.pais && d.pais.length <= 3 ? d.pais.toUpperCase() : p.idOtro?.codigoPais ?? "ES");
  const iso3 = pais.length === 3 ? pais : ISO3[pais] ?? (/^españa$/i.test(d.pais ?? "") ? "ESP" : undefined);
  const enEspana = (iso3 ?? "ESP") === "ESP" && /^\d{5}$/.test(d.cp);
  if (!iso3 && !enEspana) throw new Error(`Facturae: país del ${rol} no reconocido (${d.pais})`);
  const provincia = d.provincia || (enEspana ? PROVINCIAS_CP[d.cp.slice(0, 2)] : "") || d.municipio;
  const direccion = enEspana
    ? `<AddressInSpain>${t("Address", cut(d.linea1, 80))}${t("PostCode", d.cp)}${t("Town", cut(d.municipio, 50))}${t("Province", cut(provincia, 20))}<CountryCode>ESP</CountryCode></AddressInSpain>`
    : `<OverseasAddress>${t("Address", cut(d.linea1, 80))}${t("PostCodeAndTown", cut(`${d.cp} ${d.municipio}`, 50))}${t("Province", cut(provincia, 20))}<CountryCode>${iso3}</CountryCode></OverseasAddress>`;
  const contacto = p.email ? `<ContactDetails>${t("ElectronicMail", cut(p.email, 60))}</ContactDetails>` : "";
  let entidad: string;
  if (fisica) {
    const pf = p.personaFisica ?? (() => { const w = p.nombre.trim().split(/\s+/); return { nombre: w[0] ?? p.nombre, apellido1: w[1] ?? "-", apellido2: w.slice(2).join(" ") || undefined }; })();
    entidad = `<Individual>${t("Name", cut(pf.nombre, 40))}${t("FirstSurname", cut(pf.apellido1, 40))}${t("SecondSurname", cut(pf.apellido2, 40))}${direccion}${contacto}</Individual>`;
  } else entidad = `<LegalEntity>${t("CorporateName", cut(p.nombre, 80))}${direccion}${contacto}</LegalEntity>`;
  const centros = dir3 && rol === "receptor"
    ? `<AdministrativeCentres>${([["01", dir3.oficinaContable], ["02", dir3.organoGestor], ["03", dir3.unidadTramitadora]] as const).map(([r, c]) => `<AdministrativeCentre>${t("CentreCode", c)}${t("RoleTypeCode", r)}${direccion}</AdministrativeCentre>`).join("")}</AdministrativeCentres>`
    : "";
  return `<TaxIdentification><PersonTypeCode>${fisica ? "F" : "J"}</PersonTypeCode><ResidenceTypeCode>${espanol ? "R" : (iso3 && ["PRT", "FRA", "DEU", "ITA", "NLD", "BEL", "AUT", "IRL", "LUX", "DNK", "SWE", "FIN", "POL", "GRC"].includes(iso3) ? "U" : "E")}</ResidenceTypeCode>${t("TaxIdentificationNumber", id)}</TaxIdentification>${centros}${entidad}`;
}

/** Genera el XML Facturae 3.2.2 de una factura emitida. */
export function generarFacturae(f: FacturaInf, emisor: ParteFacturae, receptor: ParteFacturae, o: OpcionesFacturae = {}): string {
  if (f.tipoFactura === "F2" || f.tipoFactura === "R5") throw new Error("Facturae: las facturas simplificadas no tienen destinatario identificado");
  const imp = (i?: string) => (i === "03" ? "03" : i === "02" ? "02" : "01");
  const lineas = f.datos.lineas.map((l, i) => {
    const coste = D(l.cantidad).mul(l.precioUnitario);
    const bruto = D(f.totales.lineas?.[i]?.base ?? coste.toFixed(2));
    const dto = coste.round(8).sub(bruto);
    const exenta = !!l.exenta || l.calificacion === "N1" || l.calificacion === "N2" || l.calificacion === "S2";
    const tipo = exenta ? D(0) : D(l.tipo ?? "0");
    const cuota = bruto.mul(tipo).div(100, 8).round(2);
    const re = !exenta && l.recargo ? `<EquivalenceSurcharge>${n2(l.recargo)}</EquivalenceSurcharge><EquivalenceSurchargeAmount><TotalAmount>${n2(bruto.mul(l.recargo).div(100, 8).round(2))}</TotalAmount></EquivalenceSurchargeAmount>` : "";
    const ret = f.datos.retencionPct && l.sujetaRetencion !== false ? `<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>${n2(f.datos.retencionPct)}</TaxRate><TaxableBase><TotalAmount>${n2(bruto)}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${n2(bruto.mul(f.datos.retencionPct).div(100, 8).round(2))}</TotalAmount></TaxAmount></Tax></TaxesWithheld>` : "";
    const especial = exenta ? `<SpecialTaxableEvent><SpecialTaxableEventCode>${l.exenta ? "01" : "02"}</SpecialTaxableEventCode><SpecialTaxableEventReason>${esc(l.exenta ? `Operación exenta (${l.exenta})` : l.calificacion === "S2" ? "Inversión del sujeto pasivo" : "Operación no sujeta")}</SpecialTaxableEventReason></SpecialTaxableEvent>` : "";
    return `<InvoiceLine>${t("ItemDescription", cut(l.descripcion, 2500))}<Quantity>${D(l.cantidad).toPlain()}</Quantity><UnitPriceWithoutTax>${n8(l.precioUnitario)}</UnitPriceWithoutTax><TotalCost>${n8(coste)}</TotalCost>`
      + (dto.sign() !== 0 ? `<DiscountsAndRebates><Discount><DiscountReason>Descuento</DiscountReason>${l.descuentoPct ? `<DiscountRate>${n8(l.descuentoPct)}</DiscountRate>` : ""}<DiscountAmount>${n8(dto)}</DiscountAmount></Discount></DiscountsAndRebates>` : "")
      + `<GrossAmount>${n8(bruto)}</GrossAmount>${ret}<TaxesOutputs><Tax><TaxTypeCode>${imp(l.impuesto)}</TaxTypeCode><TaxRate>${n2(tipo)}</TaxRate><TaxableBase><TotalAmount>${n2(bruto)}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${n2(cuota)}</TotalAmount></TaxAmount>${re}</Tax></TaxesOutputs>${especial}</InvoiceLine>`;
  });
  const g = f.totales.desglose;
  const impuestos = g.map((x) => {
    const exenta = !!x.exenta || !!x.calificacion?.startsWith("N") || x.calificacion === "S2";
    const re = x.recargo ? `<EquivalenceSurcharge>${n2(x.recargo)}</EquivalenceSurcharge><EquivalenceSurchargeAmount><TotalAmount>${n2(x.cuotaRecargo)}</TotalAmount></EquivalenceSurchargeAmount>` : "";
    return `<Tax><TaxTypeCode>${imp(x.impuesto)}</TaxTypeCode><TaxRate>${n2(exenta ? "0" : x.tipo ?? "0")}</TaxRate><TaxableBase><TotalAmount>${n2(x.base)}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${n2(x.cuota)}</TotalAmount></TaxAmount>${re}</Tax>`;
  });
  const base = D(f.totales.baseTotal), cuotas = D(f.totales.cuotaTotal), ret = D(f.totales.retencion);
  const total = base.add(cuotas).sub(ret);
  const retenido = ret.sign() !== 0 ? `<TaxesWithheld><Tax><TaxTypeCode>04</TaxTypeCode><TaxRate>${n2(f.datos.retencionPct ?? "0")}</TaxRate><TaxableBase><TotalAmount>${n2(sum(f.datos.lineas.map((l, i) => (l.sujetaRetencion === false ? D(0) : D(f.totales.lineas?.[i]?.base ?? "0")))))}</TotalAmount></TaxableBase><TaxAmount><TotalAmount>${n2(ret)}</TotalAmount></TaxAmount></Tax></TaxesWithheld>` : "";
  const fechaIso = f.fechaExpedicion;
  const rect = f.datos.rectificacion;
  const corrective = rect ? (() => {
    const orig = rect.facturas[0];
    const fo = orig ? orig.FechaExpedicionFactura.split("-").reverse().join("-") : fechaIso;
    return `<Corrective>${t("InvoiceNumber", cut(orig?.NumSerieFactura, 20))}<ReasonCode>${o.motivoRectificacion ?? "16"}</ReasonCode><ReasonDescription>${esc(motivoTexto(o.motivoRectificacion ?? "16"))}</ReasonDescription><TaxPeriod><StartDate>${fo}</StartDate><EndDate>${fo}</EndDate></TaxPeriod><CorrectionMethod>${rect.tipo === "S" ? "01" : "02"}</CorrectionMethod><CorrectionMethodDescription>${rect.tipo === "S" ? "Rectificación íntegra" : "Rectificación por diferencias"}</CorrectionMethodDescription>${orig ? `<InvoiceIssueDate>${fo}</InvoiceIssueDate>` : ""}</Corrective>`;
  })() : "";
  const pago = o.iban ? `<PaymentDetails><Installment><InstallmentDueDate>${o.vencimiento ?? fechaIso}</InstallmentDueDate><InstallmentAmount>${n2(total)}</InstallmentAmount><PaymentMeans>04</PaymentMeans><AccountToBeCredited><IBAN>${esc(o.iban.replace(/\s/g, ""))}</IBAN></AccountToBeCredited></Installment></PaymentDetails>` : "";
  const literales = f.datos.lineas.some((l) => l.calificacion === "S2") ? `<LegalLiterals><LegalReference>Inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992)</LegalReference></LegalLiterals>` : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<fe:Facturae xmlns:fe="http://www.facturae.gob.es/formato/Versiones/Facturaev3_2_2.xml" xmlns:ds="http://www.w3.org/2000/09/xmldsig#">`
    + `<FileHeader><SchemaVersion>3.2.2</SchemaVersion><Modality>I</Modality><InvoiceIssuerType>EM</InvoiceIssuerType><Batch>${t("BatchIdentifier", cut(`${emisor.nif ?? ""}${f.numSerie}`, 70))}<InvoicesCount>1</InvoicesCount>`
    + `<TotalInvoicesAmount><TotalAmount>${n2(total)}</TotalAmount></TotalInvoicesAmount><TotalOutstandingAmount><TotalAmount>${n2(total)}</TotalAmount></TotalOutstandingAmount><TotalExecutableAmount><TotalAmount>${n2(total)}</TotalAmount></TotalExecutableAmount><InvoiceCurrencyCode>EUR</InvoiceCurrencyCode></Batch></FileHeader>`
    + `<Parties><SellerParty>${parte(emisor, "emisor")}</SellerParty><BuyerParty>${parte(receptor, "receptor", o.dir3)}</BuyerParty></Parties>`
    + `<Invoices><Invoice><InvoiceHeader>${t("InvoiceNumber", cut(f.numSerie, 20))}<InvoiceDocumentType>FC</InvoiceDocumentType><InvoiceClass>${rect ? "OR" : "OO"}</InvoiceClass>${corrective}</InvoiceHeader>`
    + `<InvoiceIssueData><IssueDate>${fechaIso}</IssueDate>${t("OperationDate", f.fechaOperacion)}<InvoiceCurrencyCode>EUR</InvoiceCurrencyCode><TaxCurrencyCode>EUR</TaxCurrencyCode><LanguageName>es</LanguageName>${t("InvoiceDescription", cut(f.datos.descripcionOperacion, 2500))}</InvoiceIssueData>`
    + `<TaxesOutputs>${impuestos.join("")}</TaxesOutputs>${retenido}`
    + `<InvoiceTotals><TotalGrossAmount>${n8(base)}</TotalGrossAmount><TotalGrossAmountBeforeTaxes>${n8(base)}</TotalGrossAmountBeforeTaxes><TotalTaxOutputs>${n8(cuotas)}</TotalTaxOutputs><TotalTaxesWithheld>${n8(ret)}</TotalTaxesWithheld><InvoiceTotal>${n8(total)}</InvoiceTotal><TotalOutstandingAmount>${n8(total)}</TotalOutstandingAmount><TotalExecutableAmount>${n8(total)}</TotalExecutableAmount></InvoiceTotals>`
    + `<Items>${lineas.join("")}</Items>${pago}${literales}</Invoice></Invoices></fe:Facturae>\n`;
}
const MOTIVOS: Record<string, string> = { "01": "Número de la factura", "02": "Serie de la factura", "03": "Fecha expedición", "04": "Nombre y apellidos/Razón social - Emisor", "05": "Nombre y apellidos/Razón social - Receptor", "06": "Identificación fiscal Emisor/obligado", "07": "Identificación fiscal Receptor", "08": "Domicilio Emisor/Obligado", "09": "Domicilio Receptor", "10": "Detalle Operación", "11": "Porcentaje impositivo a aplicar", "12": "Cuota tributaria a aplicar", "13": "Fecha/Periodo a aplicar", "14": "Clase de factura", "15": "Literales legales", "16": "Base imponible", "80": "Cálculo de cuotas repercutidas", "81": "Cálculo de cuotas retenidas", "82": "Base imponible modificada por devolución de envases / embalajes", "83": "Base imponible modificada por descuentos y bonificaciones", "84": "Base imponible modificada por resolución firme, judicial o administrativa", "85": "Base imponible modificada cuotas repercutidas no satisfechas. Auto de declaración de concurso" };
const motivoTexto = (c: string) => MOTIVOS[c] ?? "Base imponible";
