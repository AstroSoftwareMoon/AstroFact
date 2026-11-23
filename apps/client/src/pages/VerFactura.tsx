import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Ban, CheckCircle2, Code2, FileDiff, Printer, Share2 } from "lucide-react";
import { useApp } from "../state/app";
import { Chip, Modal, Panel } from "../ui/kit";
import DocumentoFactura from "../components/DocumentoFactura";
import EstadoFactura from "../components/EstadoFactura";
import { descargar } from "../platform/storage";
import { corto, euros, fechaHora } from "../format";

export default function VerFactura() {
  const { id } = useParams();
  const { store, obligado: o, toast } = useApp();
  const nav = useNavigate();
  const f = store.factura(Number(id));
  const [xml, setXml] = useState<string>();
  const [anular, setAnular] = useState(false);
  const [rect, setRect] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState<string>();
  if (!f || f.obligadoId !== o.id) return <p>Factura no encontrada.</p>;
  const regs = store.registrosFactura(f.id);
  const rectificadora = f.rectificadaPor ? store.factura(f.rectificadaPor) : undefined;
  const email = f.datos.destinatarios?.[0] ? store.tercero(f.terceroId ?? 0)?.email : undefined;
  const asunto = encodeURIComponent(`Factura ${f.numSerie}`);
  const cuerpo = encodeURIComponent(`Hola,\n\nTe envío la factura ${f.numSerie} por importe de ${euros(f.totales.totalAPagar)}.\n\nUn saludo,\n${o.nombre}`);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3 mb-5">
        <Link to="/facturas" className="btn-ghost h-9 w-9 px-0" aria-label="Volver"><ArrowLeft size={16} /></Link>
        <h1 className="text-2xl font-semibold font-mono tracking-tight">{f.numSerie}</h1>
        <EstadoFactura f={f} />{f.dePruebas && <Chip tono="warn">PRUEBAS</Chip>}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => window.print()}><Printer size={16} />Imprimir / PDF</button>
          <a className="btn-ghost" href={`mailto:${email ?? ""}?subject=${asunto}&body=${cuerpo}`}><Share2 size={16} />Email</a>
          <a className="btn-ghost" href={`https://wa.me/?text=${cuerpo}`} target="_blank" rel="noreferrer">WhatsApp</a>
          {!f.anulada && <button className="btn-ghost" onClick={() => setRect(true)}><FileDiff size={16} />Rectificar</button>}
          {!f.anulada && <button className="btn-ghost text-bad" onClick={() => setAnular(true)}><Ban size={16} />Anular</button>}
        </div>
      </div>
      <div className="grid xl:grid-cols-[1fr_320px] gap-5 items-start">
        <div className="overflow-x-auto rounded-2xl"><DocumentoFactura f={f} o={o} /></div>
        <div className="space-y-4">
          <Panel>
            <h2 className="font-semibold mb-2">Cobro</h2>
            <select className="input" value={f.estadoCobro} onChange={(e) => { store.marcarCobro(f.id, e.target.value as typeof f.estadoCobro); toast("Estado de cobro actualizado"); }}>
              <option value="pendiente">Pendiente</option><option value="parcial">Cobro parcial</option><option value="cobrada">Cobrada</option><option value="impagada">Impagada</option></select>
            {rectificadora && <p className="text-sm mt-3">Rectificada por <Link className="text-accent font-mono" to={`/facturas/${rectificadora.id}`}>{rectificadora.numSerie}</Link></p>}
          </Panel>
          <Panel>
            <h2 className="font-semibold mb-3">Registros de facturación</h2>
            <ol className="space-y-3">{regs.map((r) => (
              <li key={r.id} className="rounded-2xl bg-glass/[.04] border border-line/10 p-3 text-xs">
                <div className="flex items-center justify-between"><Chip tono={r.tipo === "alta" ? "acc" : "bad"}>{r.tipo === "alta" ? "Alta" : "Anulación"}</Chip>{r.firmado && <span className="flex items-center gap-1 text-ok"><CheckCircle2 size={13} />Firmado XAdES</span>}</div>
                <div className="mt-2 text-muted">Generado {fechaHora(r.fechaHoraGen)}</div>
                <div className="font-mono mt-1 break-all" title={r.huella}>Huella {corto(r.huella)}</div>
                <div className="font-mono text-muted break-all">Anterior {r.huellaAnterior ? corto(r.huellaAnterior) : "— (primer registro)"}</div>
                <div className="flex gap-2 mt-2">
                  <button className="btn-ghost h-8 text-xs" onClick={() => setXml(r.xml)}><Code2 size={14} />XML</button>
                  <button className="btn-ghost h-8 text-xs" onClick={() => descargar(`${r.numSerie}-${r.tipo}.xml`, r.xml)}>Descargar</button>
                  <Link className="btn-ghost h-8 text-xs" to={`/registro?r=${r.id}`}>En la cadena</Link>
                </div>
              </li>))}</ol>
          </Panel>
        </div>
      </div>
      <Modal abierto={!!xml} onClose={() => setXml(undefined)} titulo="Registro de facturación (XML)" ancho="max-w-3xl">
        <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-black/30 rounded-xl p-4 max-h-[60vh] overflow-auto">{xml}</pre>
      </Modal>
      <Modal abierto={anular} onClose={() => setAnular(false)} titulo="Anular factura">
        <p className="text-sm text-muted">La anulación genera un <b className="text-fg">registro de anulación</b> encadenado. Úsala solo si la factura no debió expedirse (p. ej. emitida por error). Si la operación existió y cambian sus importes, usa una <b className="text-fg">rectificativa</b>. La factura no se borra.</p>
        <input className="input mt-4" placeholder="Motivo (para tu auditoría interna)" value={motivo} onChange={(e) => setMotivo(e.target.value)} />
        {err && <p className="text-sm text-bad mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5"><button className="btn-ghost" onClick={() => setAnular(false)}>Cancelar</button>
          <button className="btn-danger" onClick={async () => { try { await store.anular(f.id, motivo); toast("Registro de anulación generado"); setAnular(false); } catch (e) { setErr((e as Error).message); } }}>Anular factura</button></div>
      </Modal>
      <Modal abierto={rect} onClose={() => setRect(false)} titulo="Factura rectificativa">
        <p className="text-sm text-muted mb-4">Elige cómo rectificar <b className="font-mono text-fg">{f.numSerie}</b>:</p>
        <div className="grid gap-3">
          <button className="glass !rounded-2xl p-4 text-left hover:ring-2 hover:ring-accent" onClick={() => nav("/facturas/nueva", { state: { borrador: store.borradorRectificativa(f.id, "S") } })}><div className="font-medium">Por sustitución</div><p className="text-xs text-muted mt-1">La nueva factura sustituye a la original con los importes correctos completos.</p></button>
          <button className="glass !rounded-2xl p-4 text-left hover:ring-2 hover:ring-accent" onClick={() => nav("/facturas/nueva", { state: { borrador: store.borradorRectificativa(f.id, "I") } })}><div className="font-medium">Por diferencias</div><p className="text-xs text-muted mt-1">Solo la diferencia (positiva o negativa). Útil para abonos y devoluciones.</p></button>
        </div>
      </Modal>
    </>
  );
}
