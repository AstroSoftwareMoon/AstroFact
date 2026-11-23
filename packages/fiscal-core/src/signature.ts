/**
 * Firma electrónica XAdES Enveloped (clase EPES) de registros de facturación y de evento.
 * Fuentes: art. 14 Orden HAC/1177/2024; AEAT "VERI*FACTU – Especificaciones técnicas para
 * generación de la firma electrónica de los registros de facturación" v0.1.5 (06/03/2025):
 *  - XAdES Enveloped (ETSI EN 319 132), al menos EPES con la Política de Firma de la AGE
 *    (OID urn:oid:2.16.724.1.3.1.1.2.1.9, digest SHA-1 G7roucf600+f03r/o0bAOQ6WAs0=).
 *  - RSA ≥ 1024 bits, hash SHA-256 en la firma del registro.
 *  - Se firma el nodo RegistroAlta / RegistroAnulacion / RegistroEvento (nunca los superiores).
 *  - La firma se guarda en RegistroAlta/Signature, RegistroAnulacion/Signature o
 *    RegistroEvento/Evento/Signature.
 * Solo exigible en modo No VERI*FACTU.
 */
import * as xadesjs from "xadesjs";
import * as xmldom from "@xmldom/xmldom";
import xpath from "xpath";
import * as xmldsig from "xmldsigjs";
import forge from "node-forge";

export const POLITICA_FIRMA_AGE = {
  oid: "urn:oid:2.16.724.1.3.1.1.2.1.9",
  url: "https://sede.administracion.gob.es/politica_de_firma_anexo_1.pdf",
  digestSha1: "G7roucf600+f03r/o0bAOQ6WAs0=",
} as const;

let initialized = false;
function init() {
  if (initialized) return;
  const c = globalThis.crypto;
  if (!c?.subtle) throw new Error("WebCrypto no disponible en este entorno");
  xadesjs.Application.setEngine("WebCrypto", c as Crypto);
  if (typeof (globalThis as any).DOMParser === "undefined") {
    xadesjs.setNodeDependencies({
      XMLSerializer: xmldom.XMLSerializer as any, DOMParser: xmldom.DOMParser as any,
      DOMImplementation: xmldom.DOMImplementation as any, xpath: xpath as any,
    } as any);
  }
  initialized = true;
}

export interface Credencial {
  privateKey: CryptoKey;
  /** Certificado del firmante en DER base64 */
  certificadoB64: string;
  /** Cadena (sin el del firmante), DER base64 */
  cadenaB64: string[];
  titular: { cn?: string; serialNumber?: string; nif?: string };
  validoDesde: Date;
  validoHasta: Date;
  bitsClave: number;
}

const toB64 = (der: string) => forge.util.encode64(der);
const bytesFromBinary = (bin: string) => { const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

/** Carga un PKCS#12 (.p12/.pfx) protegido con contraseña. La contraseña no se conserva. */
export async function cargarPkcs12(p12: Uint8Array, password: string): Promise<Credencial> {
  init();
  let bin = ""; for (const b of p12) bin += String.fromCharCode(b);
  const asn1 = forge.asn1.fromDer(bin);
  const pkcs12 = forge.pkcs12.pkcs12FromAsn1(asn1, false, password);
  const keyBags = pkcs12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag! })[forge.pki.oids.pkcs8ShroudedKeyBag!] ?? [];
  const plainKeys = pkcs12.getBags({ bagType: forge.pki.oids.keyBag! })[forge.pki.oids.keyBag!] ?? [];
  const keyBag = keyBags[0] ?? plainKeys[0];
  if (!keyBag?.key) throw new Error("El PKCS#12 no contiene clave privada");
  const certs = (pkcs12.getBags({ bagType: forge.pki.oids.certBag! })[forge.pki.oids.certBag!] ?? []).map((b) => b.cert!).filter(Boolean);
  const key = keyBag.key as forge.pki.rsa.PrivateKey;
  const pub = forge.pki.setRsaPublicKey(key.n, key.e);
  const signer = certs.find((c) => (c.publicKey as forge.pki.rsa.PublicKey).n.equals(pub.n)) ?? certs[0];
  if (!signer) throw new Error("El PKCS#12 no contiene el certificado del firmante");
  const pkcs8 = forge.asn1.toDer(forge.pki.wrapRsaPrivateKey(forge.pki.privateKeyToAsn1(key))).getBytes();
  const privateKey = await globalThis.crypto.subtle.importKey("pkcs8", bytesFromBinary(pkcs8), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const der = (c: forge.pki.Certificate) => forge.asn1.toDer(forge.pki.certificateToAsn1(c)).getBytes();
  const attr = (n: string) => signer.subject.getField(n)?.value as string | undefined;
  const serial = signer.subject.attributes.find((a) => a.type === "2.5.4.5")?.value as string | undefined;
  return {
    privateKey,
    certificadoB64: toB64(der(signer)),
    cadenaB64: certs.filter((c) => c !== signer).map((c) => toB64(der(c))),
    titular: { cn: attr("CN"), serialNumber: serial, nif: serial?.replace(/^IDCES-|^VATES-/, "") },
    validoDesde: signer.validity.notBefore,
    validoHasta: signer.validity.notAfter,
    bitsClave: key.n.bitLength(),
  };
}

function localName(n: Node): string { return (n as Element).localName ?? n.nodeName.replace(/^.*:/, ""); }

/**
 * Firma un documento XML cuyo elemento raíz es RegistroAlta, RegistroAnulacion o RegistroEvento.
 * Devuelve el XML firmado (UTF-8).
 */
export async function firmarRegistroXml(xml: string, cred: Credencial, ahora = new Date()): Promise<string> {
  init();
  if (cred.bitsClave < 1024) throw new Error("La clave RSA debe tener al menos 1024 bits");
  if (ahora < cred.validoDesde || ahora > cred.validoHasta) throw new Error("El certificado no está en vigor en la fecha de firma");
  const doc = xadesjs.Parse(xml);
  const root = doc.documentElement;
  const tipo = localName(root);
  if (!["RegistroAlta", "RegistroAnulacion", "RegistroEvento"].includes(tipo)) throw new Error(`Nodo raíz no firmable: ${tipo}`);
  const signedXml = new xadesjs.SignedXml();
  const sig = await signedXml.Sign({ name: "RSASSA-PKCS1-v1_5" } as Algorithm, cred.privateKey, doc, {
    references: [{ hash: "SHA-256", transforms: ["enveloped"], uri: "" }],
    x509: [cred.certificadoB64],
    signingCertificate: { certificate: cred.certificadoB64, digestAlgorithm: "SHA-256" },
    signingTime: { value: ahora },
    policy: {
      hash: "SHA-1",
      digestValue: POLITICA_FIRMA_AGE.digestSha1,
      identifier: { value: POLITICA_FIRMA_AGE.oid },
      qualifiers: [POLITICA_FIRMA_AGE.url],
    },
    signedPropertiesReference: { hash: "SHA-256", transforms: ["c14n"] },
  } as any);
  const sigEl = sig.GetXml();
  if (!sigEl) throw new Error("No se pudo generar la firma");
  // Ubicación: RegistroAlta/Signature, RegistroAnulacion/Signature, RegistroEvento/Evento/Signature.
  // La transformación enveloped excluye el nodo Signature esté donde esté, así que moverlo no altera el digest.
  let parent: Element = root;
  if (tipo === "RegistroEvento") {
    const evento = Array.from(root.childNodes).find((n) => n.nodeType === 1 && localName(n) === "Evento") as Element | undefined;
    if (!evento) throw new Error("RegistroEvento sin nodo Evento");
    parent = evento;
  }
  parent.appendChild(doc.importNode(sigEl, true));
  const S = (globalThis as any).XMLSerializer ?? xmldom.XMLSerializer;
  const out: string = new S().serializeToString(doc);
  return out.startsWith("<?xml") ? out : `<?xml version="1.0" encoding="UTF-8"?>\n${out}`;
}

export interface ResultadoVerificacionFirma { valida: boolean; titular?: string; motivo?: string; politica?: string; }

/** Verifica criptográficamente la firma XAdES de un registro (art. 6.d). No valida la cadena de confianza. */
export async function verificarFirmaXml(xml: string): Promise<ResultadoVerificacionFirma> {
  init();
  try {
    const doc = xadesjs.Parse(xml);
    const sigs = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "Signature");
    if (sigs.length !== 1) return { valida: false, motivo: sigs.length ? "Más de una firma" : "Registro sin firma" };
    // Verificación con el núcleo XMLDSig (todas las Reference, incluida la de SignedProperties,
    // y SignatureValue). Se usa xmldsigjs directamente porque el modelo XAdES de xadesjs v3
    // no carga SigPolicyQualifier (SPURI) al verificar.
    const sigEl = sigs[0] as Element;
    // La transformación enveloped (XMLDSig §6.6.4) excluye la Signature esté donde esté, pero
    // xmldsigjs solo retira las Signature hijas directas de la raíz: en RegistroEvento la firma
    // va en Evento/Signature, así que la reubicamos en la raíz solo para verificar (no altera el digest).
    if (sigEl.parentNode !== doc.documentElement) { sigEl.parentNode!.removeChild(sigEl); doc.documentElement.appendChild(sigEl); }
    const signedXml = new xmldsig.SignedXml(doc);
    signedXml.LoadXml(sigEl);
    const valida = await signedXml.Verify();
    const byLocal = (n: string) => { const l = doc.getElementsByTagNameNS("http://uri.etsi.org/01903/v1.3.2#", n); return l.length ? l[0]!.textContent?.trim() : undefined; };
    const pol = byLocal("Identifier");
    const certB64 = doc.getElementsByTagNameNS("http://www.w3.org/2000/09/xmldsig#", "X509Certificate")[0]?.textContent?.replace(/\s|&#13;/g, "");
    let titular: string | undefined;
    if (certB64) { try { const c = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(certB64))); titular = c.subject.getField("CN")?.value as string; } catch { /* certificado no legible */ } }
    return { valida, politica: pol, titular, motivo: valida ? undefined : "La firma no corresponde al contenido" };
  } catch (e) {
    return { valida: false, motivo: (e as Error).message };
  }
}

/** Genera un certificado autofirmado SOLO PARA PRUEBAS (nunca para uso real). */
export function generarPkcs12Prueba(opts: { nif: string; nombre: string; password: string; bits?: number; dias?: number }): Uint8Array {
  const keys = forge.pki.rsa.generateKeyPair({ bits: opts.bits ?? 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 86400_000);
  cert.validity.notAfter = new Date(Date.now() + (opts.dias ?? 365) * 86400_000);
  const attrs = [{ name: "commonName", value: `${opts.nombre} - ${opts.nif} (PRUEBAS)` }, { name: "countryName", value: "ES" }, { type: "2.5.4.5", value: `IDCES-${opts.nif}` }];
  cert.setSubject(attrs as any); cert.setIssuer(attrs as any);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p12 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], opts.password, { algorithm: "aes256" });
  return bytesFromBinary(forge.asn1.toDer(p12).getBytes());
}
