/** SOLO PRUEBAS. PKI de pruebas: CA propia, certificado de servidor (localhost) y certificado de cliente en PKCS#12. */
import forge from "node-forge";

function cert(subject: { name: string; value: string }[], issuer: { cert?: forge.pki.Certificate; key: forge.pki.rsa.PrivateKey } | null, opts: { ca?: boolean; dns?: string; bits?: number } = {}) {
  const keys = forge.pki.rsa.generateKeyPair({ bits: opts.bits ?? 2048 });
  const c = forge.pki.createCertificate();
  c.publicKey = keys.publicKey; c.serialNumber = "01" + forge.util.bytesToHex(forge.random.getBytesSync(8));
  c.validity.notBefore = new Date(Date.now() - 86400_000); c.validity.notAfter = new Date(Date.now() + 365 * 86400_000);
  c.setSubject(subject as any); c.setIssuer((issuer?.cert?.subject.attributes ?? subject) as any);
  const ext: any[] = [{ name: "basicConstraints", cA: !!opts.ca }];
  if (opts.dns) ext.push({ name: "subjectAltName", altNames: [{ type: 2, value: opts.dns }, { type: 7, ip: "127.0.0.1" }] });
  c.setExtensions(ext);
  c.sign(issuer?.key ?? keys.privateKey, forge.md.sha256.create());
  return { cert: c, key: keys.privateKey };
}

export function crearPki(nif: string) {
  const ca = cert([{ name: "commonName", value: "CA de pruebas AstroFact" }], null, { ca: true });
  const srv = cert([{ name: "commonName", value: "localhost" }], ca, { dns: "localhost" });
  const cli = cert([{ name: "commonName", value: `CLIENTE PRUEBAS - ${nif}` }, { name: "serialNumber", value: `IDCES-${nif}` }], ca);
  const p12 = forge.asn1.toDer(forge.pkcs12.toPkcs12Asn1(cli.key, [cli.cert, ca.cert], "clave", { algorithm: "aes256" })).getBytes();
  return {
    caPem: forge.pki.certificateToPem(ca.cert),
    servidor: { cert: forge.pki.certificateToPem(srv.cert), key: forge.pki.privateKeyToPem(srv.key) },
    clienteP12: Uint8Array.from(p12, (ch) => ch.charCodeAt(0)), clienteClave: "clave",
  };
}
