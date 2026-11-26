import { useState } from "react";
import { Link } from "react-router-dom";
import { BadgeCheck, CalendarClock, Download, ExternalLink, FileText, Scale, ShieldAlert, ShieldCheck } from "lucide-react";
import { OBLIGATORIEDAD, TIPO_EVENTO } from "@astrofact/fiscal-core";
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
type Fechas = { fecha: string; sii: boolean };
const FECHAS_DEF: Fechas = { fecha: OBLIGATORIEDAD.fecha ?? "", sii: false };

export default function Cumplimiento() {
  const { store, obligado: o, modo } = useApp();
  const [doc, setDoc] = useState<"declaracion" | "aviso">("declaracion");
  const [fechas, setFechasS] = useState<Fechas>(() => { try { const g = JSON.parse(pref.get("obligatoriedad") ?? "{}"); return { ...FECHAS_DEF, ...g }; } catch { return FECHAS_DEF; } });
  const setFechas = (f: Fechas) => { setFechasS(f); pref.set("obligatoriedad", JSON.stringify(f)); };
  const si = store.sistemaInformatico();
  const regs = store.registros(o.id);
  const evs = store.eventos(o.id, 500);
  const ultimo = (t: string) => evs.find((e) => e.tipo === t);
  const alarmas = store.alarmasAbiertas(o.id);
  const verif = ultimo("03"), resumen = ultimo("09"), sinFirmar = evs.filter((e) => !e.firmado).length;
  const fecha = fechas.fecha;
  const dias = fecha ? Math.ceil((new Date(fecha + "T00:00:00").getTime() - new Date(store.hoy(o.id) + "T00:00:00").getTime()) / 86_400_000) : NaN;
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
            <h2 className="font-semibold flex items-center gap-2 mb-1"><CalendarClock size={18} className="text-accent" />¿Cuándo es obligatorio?</h2>
            <p className="text-xs text-muted mb-3">Desde el Real Decreto-ley 43/2026 (BOE 25/11/2026), un sistema de registros (VERI*FACTU o No VERI*FACTU) será obligatorio <b>{OBLIGATORIEDAD.mesesTrasOrden} meses después</b> de que entre en vigor la orden ministerial de la factura electrónica (RD 238/2026). <b>Todavía no hay fecha fija</b>; las de 2027 ya no están vigentes.</p>
            <label className="flex items-center gap-2 text-sm mb-3"><input type="checkbox" className="h-4 w-4" checked={fechas.sii} onChange={(e) => setFechas({ ...fechas, sii: e.target.checked })} />Llevo los libros en el SII (art. 3.3 RD 1007/2023: no me aplica)</label>
            {!fechas.sii && <Campo label="Fecha de obligatoriedad (cuando se publique)" ayuda="Revísala en el BOE: AstroFact no la inventa."><input className="input" type="date" value={fechas.fecha} onChange={(e) => setFechas({ ...fechas, fecha: e.target.value })} /></Campo>}
            <p className="text-sm mt-3">{fechas.sii ? "Con el SII no estás obligado a usar un sistema de registros: puedes seguir en «Solo facturas»." : !fecha ? <>Sin fecha fijada: hoy puedes usar <b>«Solo facturas»</b>.</> : dias > 0 ? <>Faltan <b className="text-accent tabular-nums">{dias}</b> días para el {fecha.split("-").reverse().join("/")}.</> : <span className="text-warn">Obligatorio desde el {fecha.split("-").reverse().join("/")}{o.modo === "sin_registros" ? ": activa un sistema de registros en Ajustes." : "."}</span>}</p>
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
