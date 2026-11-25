/**
 * Simulador del servicio SOAP «VerifactuSOAP» de la AEAT. NO es la AEAT: reproduce el formato de
 * petición/respuesta (SuministroLR.xsd / RespuestaSuministro.xsd), las reglas de los cuadros oficiales
 * de operativa de alta y anulación y un subconjunto de validaciones de negocio con sus códigos oficiales
 * (errores.properties). Sirve para tests de integración y para probar la app sin certificado.
 */
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  D, huellaAlta, huellaAnulacion, isValidNif, NS, resultadoCuadro, textoErrorAeat, compareCalendarDates, aeatDateToIso,
  type EstadoClaveAeat,
} from "@astrofact/fiscal-core";

export interface OpcionesSim {
  /** Directorio con los XSD oficiales (para validar con xmllint). Si no se indica, no se valida el esquema. */
  xsdDir?: string;
  tiempoEsperaSeg?: number;
  ahora?: () => Date;
  /** NIF que se considerarán «no identificados en el censo» (código 1110/2001). */
  noCensados?: string[];
}
interface Registro { estado: EstadoClaveAeat; huella: string; idPeticion: string; aceptadoConErrores: boolean; }
export interface Respuesta { status: number; body: string; }

const kids = (e: Element) => Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const hijo = (e: Element | undefined, n: string) => (e ? kids(e).find((k) => k.localName === n) : undefined);
const txt = (e: Element | undefined, n: string) => hijo(e, n)?.textContent?.trim() ?? undefined;
function buscar(e: Element, n: string): Element | undefined { if (e.localName === n) return e; for (const k of kids(e)) { const r = buscar(k, n); if (r) return r; } return undefined; }
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function faultSoap(codigo: string, mensaje: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="${NS.soapenv}"><env:Body><env:Fault><faultcode>env:${codigo}</faultcode><faultstring>${esc(mensaje)}</faultstring></env:Fault></env:Body></env:Envelope>`;
}

export class SimuladorAeat {
  readonly registros = new Map<string, Registro>();
  readonly peticiones: string[] = [];
  /** Inyección de fallos para tests: respuestas HTTP 503 / SOAP Fault de servidor en las próximas N peticiones. */
  fallosPendientes = 0;
  private seq = 0;
  constructor(readonly o: OpcionesSim = {}) {}
  private ahora() { return this.o.ahora?.() ?? new Date(); }

  private validarEsquema(regFactu: Element): string | null {
    if (!this.o.xsdDir) return null;
    const d = mkdtempSync(join(tmpdir(), "aeatsim-"));
    try {
      const f = join(d, "peticion.xml");
      writeFileSync(f, `<?xml version="1.0" encoding="UTF-8"?>${new XMLSerializer().serializeToString(regFactu as any)}`);
      execFileSync("xmllint", ["--noout", "--nonet", "--schema", join(this.o.xsdDir, "SuministroLR.xsd"), f], { stdio: "pipe" });
      return null;
    } catch (e: any) { return String(e.stderr ?? e.message).split("\n").find((l) => /error/i.test(l)) ?? "Error de esquema"; }
    finally { rmSync(d, { recursive: true, force: true }); }
  }

  procesar(soap: string): Respuesta {
    this.peticiones.push(soap);
    if (this.fallosPendientes > 0) { this.fallosPendientes--; return { status: 503, body: "Service Unavailable" }; }
    let doc: Document;
    try { doc = new DOMParser({ onError: () => { throw new Error("xml"); } }).parseFromString(soap, "text/xml") as unknown as Document; }
    catch { return { status: 500, body: faultSoap("Client", `Codigo[4103].${textoErrorAeat(4103)}`) }; }
    const raiz = doc.documentElement as unknown as Element;
    const reg = raiz ? buscar(raiz, "RegFactuSistemaFacturacion") : undefined;
    if (!reg || reg.namespaceURI !== NS.SuministroLR) return { status: 500, body: faultSoap("Client", `Codigo[4102].${textoErrorAeat(4102)}`) };
    const errXsd = this.validarEsquema(reg);
    if (errXsd) return { status: 500, body: faultSoap("Client", `Codigo[4102].${textoErrorAeat(4102)} ${errXsd}`) };
    const cab = hijo(reg, "Cabecera")!;
    const ob = hijo(cab, "ObligadoEmision");
    const nifOb = txt(ob, "NIF") ?? "";
    if (!isValidNif(nifOb)) return { status: 500, body: faultSoap("Client", `Codigo[4116].${textoErrorAeat(4116)}`) };

    const lineas: string[] = [];
    let ok = 0, ko = 0;
    const hoyIso = this.ahora().toISOString().slice(0, 10);
    for (const rf of kids(reg).filter((k) => k.localName === "RegistroFactura")) {
      const alta = hijo(rf, "RegistroAlta"), anul = hijo(rf, "RegistroAnulacion");
      const el = (alta ?? anul)!;
      const idF = hijo(el, "IDFactura")!;
      const nif = txt(idF, alta ? "IDEmisorFactura" : "IDEmisorFacturaAnulada")!;
      const num = txt(idF, alta ? "NumSerieFactura" : "NumSerieFacturaAnulada")!;
      const fecha = txt(idF, alta ? "FechaExpedicionFactura" : "FechaExpedicionFacturaAnulada")!;
      const claveR = `${nif}|${num}|${fecha}`;
      const previo = this.registros.get(claveR);
      const estadoClave: EstadoClaveAeat = previo?.estado ?? "no_existe";
      const huellaAnt = txt(hijo(hijo(el, "Encadenamiento"), "RegistroAnterior"), "Huella") ?? "";
      const fhg = txt(el, "FechaHoraHusoGenRegistro")!;
      const huella = txt(el, "Huella")!;
      let error: number | undefined; let aceptadoConErrores = false; let errorAdmisible: number | undefined;
      const op = alta
        ? { tipo: "alta" as const, Subsanacion: txt(alta, "Subsanacion"), RechazoPrevio: txt(alta, "RechazoPrevio") }
        : { tipo: "anulacion" as const, SinRegistroPrevio: txt(anul!, "SinRegistroPrevio"), RechazoPrevio: txt(anul!, "RechazoPrevio") };

      if (nif !== nifOb) error = 1108;
      else if (alta && compareCalendarDates(aeatDateToIso(fecha), hoyIso) > 0) error = 1112;
      else if (alta && ["F1", "F3", "R1", "R2", "R3", "R4"].includes(txt(alta, "TipoFactura")!) && !hijo(alta, "Destinatarios")) error = 1189;
      else if (alta && (this.o.noCensados ?? []).some((n) => kids(hijo(alta, "Destinatarios") ?? alta).some((d) => txt(d, "NIF") === n))) error = 1110;
      if (!error) {
        const c = resultadoCuadro(op, estadoClave);
        if (!c.ok) error = c.codigo;
      }
      if (!error && alta) {
        // Errores admisibles: huella (2000) e ImporteTotal (2005) → «AceptadoConErrores»
        const calc = huellaAlta({ IDEmisorFactura: nif, NumSerieFactura: num, FechaExpedicionFactura: fecha, TipoFactura: txt(alta, "TipoFactura")!,
          CuotaTotal: txt(alta, "CuotaTotal")!, ImporteTotal: txt(alta, "ImporteTotal")!, Huella: huellaAnt, FechaHoraHusoGenRegistro: fhg });
        if (calc !== huella) { aceptadoConErrores = true; errorAdmisible = 2000; }
        else {
          let suma = D(0);
          for (const det of kids(hijo(alta, "Desglose")!)) for (const k of ["BaseImponibleOimporteNoSujeto", "CuotaRepercutida", "CuotaRecargoEquivalencia"]) { const v = txt(det, k); if (v) suma = suma.add(v); }
          if (suma.sub(txt(alta, "ImporteTotal")!).abs().cmp("10.00") > 0) { aceptadoConErrores = true; errorAdmisible = 2005; }
        }
      } else if (!error && anul) {
        if (huellaAnulacion({ IDEmisorFacturaAnulada: nif, NumSerieFacturaAnulada: num, FechaExpedicionFacturaAnulada: fecha, Huella: huellaAnt, FechaHoraHusoGenRegistro: fhg }) !== huella) { aceptadoConErrores = true; errorAdmisible = 2000; }
      }
      const tipoOp = alta ? "Alta" : "Anulacion";
      const marcas = alta
        ? `${txt(alta, "Subsanacion") ? `<tik:Subsanacion>${txt(alta, "Subsanacion")}</tik:Subsanacion>` : ""}${txt(alta, "RechazoPrevio") ? `<tik:RechazoPrevio>${txt(alta, "RechazoPrevio")}</tik:RechazoPrevio>` : ""}`
        : `${txt(anul!, "RechazoPrevio") ? `<tik:RechazoPrevio>${txt(anul!, "RechazoPrevio")}</tik:RechazoPrevio>` : ""}${txt(anul!, "SinRegistroPrevio") ? `<tik:SinRegistroPrevio>${txt(anul!, "SinRegistroPrevio")}</tik:SinRegistroPrevio>` : ""}`;
      const idXml = `<tikR:IDFactura><tik:IDEmisorFactura>${esc(nif)}</tik:IDEmisorFactura><tik:NumSerieFactura>${esc(num)}</tik:NumSerieFactura><tik:FechaExpedicionFactura>${fecha}</tik:FechaExpedicionFactura></tikR:IDFactura>`;
      let estadoReg: string, extra = "";
      if (error) {
        ko++; estadoReg = "Incorrecto";
        extra = `<tikR:CodigoErrorRegistro>${error}</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>${esc(textoErrorAeat(error))}</tikR:DescripcionErrorRegistro>`;
        if (error === 3000 && previo) extra += `<tikR:RegistroDuplicado><tik:IdPeticionRegistroDuplicado>${previo.idPeticion}</tik:IdPeticionRegistroDuplicado><tik:EstadoRegistroDuplicado>${previo.estado === "anulada" ? "Anulada" : previo.aceptadoConErrores ? "AceptadaConErrores" : "Correcta"}</tik:EstadoRegistroDuplicado></tikR:RegistroDuplicado>`;
      } else {
        ok++; estadoReg = aceptadoConErrores ? "AceptadoConErrores" : "Correcto";
        if (errorAdmisible) extra = `<tikR:CodigoErrorRegistro>${errorAdmisible}</tikR:CodigoErrorRegistro><tikR:DescripcionErrorRegistro>${esc(textoErrorAeat(errorAdmisible))}</tikR:DescripcionErrorRegistro>`;
        this.registros.set(claveR, { estado: alta ? "alta" : "anulada", huella, idPeticion: String(++this.seq).padStart(20, "0").slice(-20), aceptadoConErrores });
      }
      lineas.push(`<tikR:RespuestaLinea>${idXml}<tikR:Operacion><tik:TipoOperacion>${tipoOp}</tik:TipoOperacion>${marcas}</tikR:Operacion><tikR:EstadoRegistro>${estadoReg}</tikR:EstadoRegistro>${extra}</tikR:RespuestaLinea>`);
    }
    const estadoEnvio = ko === 0 ? "Correcto" : ok === 0 ? "Incorrecto" : "ParcialmenteCorrecto";
    const csv = ok ? `SIM${Date.now().toString(36).toUpperCase()}${String(this.seq).padStart(6, "0")}` : undefined;
    const ts = this.ahora().toISOString().replace(/\.\d{3}Z$/, "+00:00");
    const cuerpo = `<tikR:RespuestaRegFactuSistemaFacturacion xmlns:tikR="${NS.RespuestaSuministro}" xmlns:tik="${NS.SuministroInformacion}">`
      + (csv ? `<tikR:CSV>${csv}</tikR:CSV>` : "")
      + `<tikR:DatosPresentacion><tik:NIFPresentador>${nifOb}</tik:NIFPresentador><tik:TimestampPresentacion>${ts}</tik:TimestampPresentacion></tikR:DatosPresentacion>`
      + `<tikR:Cabecera><tik:ObligadoEmision><tik:NombreRazon>${esc(txt(ob, "NombreRazon") ?? "")}</tik:NombreRazon><tik:NIF>${nifOb}</tik:NIF></tik:ObligadoEmision></tikR:Cabecera>`
      + `<tikR:TiempoEsperaEnvio>${this.o.tiempoEsperaSeg ?? 60}</tikR:TiempoEsperaEnvio><tikR:EstadoEnvio>${estadoEnvio}</tikR:EstadoEnvio>${lineas.join("")}</tikR:RespuestaRegFactuSistemaFacturacion>`;
    return { status: 200, body: `<?xml version="1.0" encoding="UTF-8"?><env:Envelope xmlns:env="${NS.soapenv}"><env:Header/><env:Body>${cuerpo}</env:Body></env:Envelope>` };
  }
}
