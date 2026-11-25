/**
 * Transporte HTTPS con certificado de cliente (mTLS) para Node: lo usa el servidor autohospedado.
 * La AEAT identifica al remitente por el certificado (art. 5 Orden HAC/1177/2024).
 */
import https from "node:https";
import http from "node:http";
import type { CredencialTls, Transporte } from "../verifactu";

export interface OpcionesTransporteNode { /** CA adicional (solo para el simulador). */ ca?: string | Buffer; timeoutMs?: number; }

export function transporteNode(o: OpcionesTransporteNode = {}): Transporte {
  return {
    enviar: (url: string, soap: string, cred: CredencialTls) => new Promise((resolve, reject) => {
      const u = new URL(url);
      const cuerpo = Buffer.from(soap, "utf8");
      // HTTP sin TLS solo para el simulador local de desarrollo (nunca la AEAT, que exige HTTPS)
      const mod = u.protocol === "http:" ? http : https;
      if (u.protocol === "http:" && !/^(localhost|127\.0\.0\.1|\[::1\]|aeat-sim)$/.test(u.hostname)) throw new Error("HTTP sin cifrar solo se permite para el simulador local");
      const req = (mod.request as typeof https.request)({
        protocol: u.protocol, hostname: u.hostname, port: u.port || 443, path: u.pathname + u.search, method: "POST",
        pfx: Buffer.from(cred.p12), passphrase: cred.password, ca: o.ca, minVersion: "TLSv1.2",
        headers: { "Content-Type": "text/xml; charset=UTF-8", "Content-Length": cuerpo.length, SOAPAction: '""' },
        timeout: o.timeoutMs ?? 120_000,
      }, (res) => {
        const partes: Buffer[] = [];
        res.on("data", (c) => partes.push(c));
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(partes).toString("utf8") }));
      });
      req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
      req.on("error", reject);
      req.end(cuerpo);
    }),
  };
}
