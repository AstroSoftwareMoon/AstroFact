/** Servidor HTTP(S) del simulador. Con `tls.ca`, exige certificado de cliente (como la AEAT). */
import http from "node:http";
import https from "node:https";
import { SimuladorAeat, type OpcionesSim } from "./sim";

export const RUTA_VERIFACTU = "/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP";

export interface OpcionesServidor extends OpcionesSim { tls?: { key: string; cert: string; ca?: string }; puerto?: number; host?: string; }

export async function arrancarSimulador(o: OpcionesServidor = {}) {
  const sim = new SimuladorAeat(o);
  const handler: http.RequestListener = (req, res) => {
    if (req.method !== "POST" || !req.url?.startsWith(RUTA_VERIFACTU)) { res.writeHead(404).end(); return; }
    if (o.tls?.ca && !(req.socket as import("node:tls").TLSSocket).authorized) { res.writeHead(403).end("Certificado de cliente requerido"); return; }
    const partes: Buffer[] = [];
    req.on("data", (c) => partes.push(c));
    req.on("end", () => {
      const r = sim.procesar(Buffer.concat(partes).toString("utf8"));
      res.writeHead(r.status, { "Content-Type": "text/xml; charset=UTF-8" }).end(r.body);
    });
  };
  const server = o.tls ? https.createServer({ key: o.tls.key, cert: o.tls.cert, ca: o.tls.ca, requestCert: !!o.tls.ca, rejectUnauthorized: !!o.tls.ca }, handler) : http.createServer(handler);
  await new Promise<void>((r) => server.listen(o.puerto ?? 0, o.host ?? "127.0.0.1", r));
  const port = (server.address() as import("node:net").AddressInfo).port;
  const url = `${o.tls ? "https" : "http"}://${o.host === "0.0.0.0" ? "localhost" : o.host ?? "127.0.0.1"}:${port}${RUTA_VERIFACTU}`;
  return { sim, url, port, cerrar: () => new Promise<void>((r) => server.close(() => r())) };
}
