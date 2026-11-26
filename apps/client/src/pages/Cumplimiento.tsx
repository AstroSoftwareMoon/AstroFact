import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, CalendarClock, Download, ExternalLink, FileText, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { FECHAS_OBLIGATORIEDAD_DEFECTO, TIPO_EVENTO } from "@astrofact/fiscal-core";
import avisoLegal from "../../../../docs/aviso-legal.md?raw";
import { useApp } from "../state/app";
import { Campo, Chip, Panel, Titulo } from "../ui/kit";
import Markdown from "../components/Markdown";
import { declaracionCompleta, declaracionResponsable, productor } from "../cumplimiento";
import { descargar, pref } from "../platform/storage";
import { fechaHora } from "../format";
import { diasDesdeCopia } from "../components/Copias";

const NORMATIVA: [string, string, string][] = [
  ["Real Decreto 1007/2023 (Reglamento de requisitos de los sistemas de facturación)", "https://www.boe.es/buscar/act.php?id=BOE-A-2023-24840", "BOE consolidado"],
  ["Orden HAC/1177/2024 (especificaciones técnicas)", "https://www.boe.es/buscar/act.php?id=BOE-A-2024-22138", "BOE consolidado"],
  ["Real Decreto 1619/2012 (Reglamento de facturación)", "https://www.boe.es/buscar/act.php?id=BOE-A-2012-14696", "BOE consolidado"],
  ["Sede AEAT · Sistemas Informáticos de Facturación y VERI*FACTU", "https://sede.agenciatributaria.gob.es/Sede/iva/sistemas-informaticos-facturacion-verifactu.html", "Documentación técnica"],
];
type Fechas = { tipo: "IS" | "resto"; is: string; resto: string };
const FECHAS_DEF: Fechas = { tipo: "resto", is: FECHAS_OBLIGATORIEDAD_DEFECTO.contribuyentesIS, resto: FECHAS_OBLIGATORIEDAD_DEFECTO.restoObligados };

export default function Cumplimiento() {
  const { store, obligado: o, modo } = useApp();
  const [doc, setDoc] = useState<"declaracion" | "aviso">("declaracion");
  const [fechas, setFechasS] = useState<Fechas>(() => { try { return { ...FECHAS_DEF, ...JSON.parse(pref.get("fechasObligatoriedad") ?? "{}") }; } catch { return FECHAS_DEF; } });
  const setFechas = (f: Fechas) => { setFechasS(f); pref.set("fechasObligatoriedad", JSON.stringify(f)); };
  const si = store.sistemaInformatico();
  const regs = store.registros(o.id);
  const evs = store.eventos(o.id, 500);
  const ultimo = (t: string) => evs.find((e) => e.tipo === t);
  const alarmas = store.alarmasAbiertas(o.id);
  const verif = ultimo("03"), resumen = ultimo("09"), sinFirmar = evs.filter((e) => !e.firmado).length;
  const fecha = fechas.tipo === "IS" ? fechas.is : fechas.resto;
  const dias = Math.ceil((new Date(fecha + "T00:00:00").getTime() - new Date(store.hoy(o.id) + "T00:00:00").getTime()) / 86_400_000);
  const copia = diasDesdeCopia();
  const texto = doc === "declaracion" ? declaracionResponsable() : avisoLegal;
  const filas: [string, React.ReactNode][] = [
    ["Sistema informático", <>{si.NombreSistemaInformatico} · código <span className="font-mono">{si.IdSistemaInformatico}</span> · versión <span className="font-mono">{si.Version}</span></>],
    ["Número de instalación", <span className="font-mono">{si.NumeroInstalacion}</span>],
    ["Productor", productor.nombre ? <>{productor.nombre} · <span className="font-mono">{productor.nif}</span></> : <span className="text-warn">Pendiente: esta compilación no incluye los datos del productor</span>],
    ["Modalidad", <>{o.modo === "verifactu" ? "VERI*FACTU (remisión a la AEAT)" : "No VERI*FACTU (registros firmados y conservados)"}{o.entorno === "pruebas" && <Chip tono="warn">PRUEBAS</Chip>}</>],
    ["Registros de facturación", regs.length ? <>{regs.length} · último {regs[regs.length - 1]!.numSerie} ({fechaHora(regs[regs.length - 1]!.fechaHoraGen)})</> : "Ninguno todavía"],
    ...(o.modo === "no_verifactu" ? [
      ["Registro de eventos", <>{evs.length}{evs.length === 500 ? "+" : ""} eventos{sinFirmar ? <span className="text-warn"> · {sinFirmar} pendientes de firma</span> : ""}{resumen ? <> · último resumen {fechaHora(resumen.fechaHoraGen)}</> : ""}</>],
      ["Última verificación de integridad", verif ? fechaHora(verif.fechaHoraGen) : <span className="text-warn">Nunca: verifícala en el registro fiscal</span>],
    ] as [string, React.ReactNode][] : []),
    ["Copia de seguridad", modo === "servidor" ? "Gestionada en el servidor" : copia === undefined ? <span className="text-warn">Nunca</span> : `Hace ${copia} días`],
  ];
  return (
    <>
      <Titulo titulo="Cumplimiento" sub="Estado del sistema de facturación, declaración responsable y normativa aplicada." />
      <div className="grid lg:grid-cols-[1fr_360px] gap-5 items-start">
        <div className="space-y-5">
          <Panel>
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="font-semibold flex items-center gap-2">{alarmas.length ? <ShieldAlert size={18} className="text-bad" /> : <ShieldCheck size={18} className="text-ok" />}Estado del sistema</h2>
              {alarmas.length ? <Chip tono="bad">{alarmas.length} alarma{alarmas.length > 1 ? "s" : ""}</Chip> : <Chip tono="ok">Sin alarmas</Chip>}
            </div>
            <dl className="divide-y divide-line/10 text-sm">{filas.map(([k, v]) => <div key={k} className="py-2.5 grid sm:grid-cols-[220px_1fr] gap-1"><dt className="text-muted">{k}</dt><dd className="flex flex-wrap items-center gap-2">{v}</dd></div>)}</dl>
            {alarmas.map((a) => <p key={a.id} className="text-sm text-bad mt-2">{a.mensaje}</p>)}
            <div className="flex flex-wrap gap-2 mt-4"><Link to="/registro" className="btn-ghost"><BadgeCheck size={16} />Verificar la cadena</Link>{modo === "local" && <Link to="/ajustes#copias" className="btn-ghost">Copias de seguridad</Link>}</div>
          </Panel>
          <Panel>
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <button className={`chip h-9 px-4 text-sm ${doc === "declaracion" ? "border-accent/50 text-fg bg-glass/[.1]" : "text-muted"}`} onClick={() => setDoc("declaracion")}><FileText size={14} />Declaración responsable</button>
              <button className={`chip h-9 px-4 text-sm ${doc === "aviso" ? "border-accent/50 text-fg bg-glass/[.1]" : "text-muted"}`} onClick={() => setDoc("aviso")}><Scale size={14} />Aviso legal</button>
              <button className="btn-ghost h-9 ml-auto" onClick={() => descargar(doc === "declaracion" ? `declaracion-responsable-AstroFact-${si.Version}.md` : "aviso-legal.md", texto, "text/markdown;charset=utf-8")}><Download size={15} />Descargar</button>
            </div>
            {doc === "declaracion" && !declaracionCompleta && <p className="text-sm rounded-2xl border border-warn/40 bg-warn/10 px-4 py-3 my-3">Esta compilación es de desarrollo o no incluye los datos del productor: la declaración responsable está <b>pendiente de suscribir</b>. Quien distribuya AstroFact debe completarla (art. 15 Orden HAC/1177/2024).</p>}
            <div data-testid="texto-legal"><Markdown texto={texto} /></div>
          </Panel>
        </div>
        <div className="space-y-5 lg:sticky lg:top-6">
          <Panel>
            <h2 className="font-semibold flex items-center gap-2 mb-1"><CalendarClock size={18} className="text-accent" />Fechas de obligatoriedad</h2>
            <p className="text-xs text-muted mb-3">Disposición final cuarta del RD 1007/2023 (texto consolidado). Son <b>configurables</b>: revísalas en el BOE si cambian.</p>
            <Campo label="Tu caso"><select className="input" value={fechas.tipo} onChange={(e) => setFechas({ ...fechas, tipo: e.target.value as Fechas["tipo"] })}><option value="IS">Contribuyente del Impuesto sobre Sociedades</option><option value="resto">Resto de obligados (autónomos…)</option></select></Campo>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Campo label="Sociedades (IS)"><input className="input" type="date" value={fechas.is} onChange={(e) => setFechas({ ...fechas, is: e.target.value })} /></Campo>
              <Campo label="Resto"><input className="input" type="date" value={fechas.resto} onChange={(e) => setFechas({ ...fechas, resto: e.target.value })} /></Campo>
            </div>
            <p className="text-sm mt-3">{dias > 0 ? <>Faltan <b className="text-accent tabular-nums">{dias}</b> días para el {fecha.split("-").reverse().join("/")}.</> : <>Obligatorio desde el {fecha.split("-").reverse().join("/")}.</>}</p>
            {(fechas.is !== FECHAS_DEF.is || fechas.resto !== FECHAS_DEF.resto) && <button className="text-xs text-accent mt-2" onClick={() => setFechas({ ...FECHAS_DEF, tipo: fechas.tipo })}>Restablecer las fechas oficiales conocidas</button>}
          </Panel>
          <Panel>
            <h2 className="font-semibold mb-2">Normativa aplicada</h2>
            <ul className="space-y-2 text-sm">{NORMATIVA.map(([t, u, d]) => <li key={u}><a className="text-accent inline-flex gap-1.5" href={u} target="_blank" rel="noreferrer"><ExternalLink size={13} className="shrink-0 mt-1" />{t}</a><div className="text-xs text-muted ml-5">{d}</div></li>)}</ul>
            <p className="text-xs text-muted mt-3">Versiones y huellas de cada documento en <span className="font-mono">docs/normativa</span>; correspondencia requisito → módulo → test en la matriz de cumplimiento del repositorio.</p>
          </Panel>
          <Panel>
            <h2 className="font-semibold mb-2">Eventos registrados</h2>
            <ul className="text-xs space-y-1 max-h-60 overflow-auto">{evs.slice(0, 30).map((e) => <li key={e.id} className="flex gap-2"><span className="text-muted tabular-nums whitespace-nowrap">{fechaHora(e.fechaHoraGen)}</span><span className="truncate">{TIPO_EVENTO[e.tipo] ?? e.tipo}</span></li>)}</ul>
            {!evs.length && <p className="text-xs text-muted">{o.modo === "verifactu" ? "En VERI*FACTU no es obligatorio el registro de eventos." : "Sin eventos."}</p>}
          </Panel>
        </div>
      </div>
    </>
  );
}
