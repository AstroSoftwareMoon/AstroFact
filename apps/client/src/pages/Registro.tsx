import { useMemo, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, CheckCircle2, Download, Link2, ShieldCheck, XCircle } from "lucide-react";
import { saltar, TIPO_ANOMALIA, TIPO_EVENTO, type TipoAnomalia } from "@astrofact/fiscal-core";
import { useApp } from "../state/app";
import { Chip, Panel, Titulo, Vacio } from "../ui/kit";
import { descargar } from "../platform/storage";
import { zip } from "../platform/zip";
import { corto, fechaHora } from "../format";

export default function Registro() {
  const { store, obligado: o, toast, rev } = useApp();
  const [sp, setSp] = useSearchParams();
  const regs = store.registros(o.id);
  const cadena = useMemo(() => store.cadena(o.id), [store, o.id, rev]);
  const sel = Math.max(0, regs.findIndex((r) => String(r.id) === sp.get("r")));
  const r = regs[sel];
  const [verif, setVerif] = useState<Awaited<ReturnType<typeof store.verificarIntegridad>> | null>(null);
  const [busy, setBusy] = useState(false);
  const hoy = store.hoy(o.id);
  const [per, setPer] = useState({ desde: `${hoy.slice(0, 4)}-01-01`, hasta: hoy });
  const ir = (i: number) => regs[i] && setSp({ r: String(regs[i]!.id) });
  const salto = (dir: "anterior" | "posterior") => saltar(cadena, sel, dir);
  const ant = r ? salto("anterior") : null, post = r ? salto("posterior") : null;
  const eventos = store.eventos(o.id, 50);

  return (
    <>
      <Titulo titulo="Registro fiscal" sub="Cadena de registros de facturación y de eventos (No VERI*FACTU). Nada de lo emitido puede editarse ni borrarse."
        acciones={<button className="btn-primary" disabled={busy} onClick={async () => { setBusy(true); try { setVerif(await store.verificarIntegridad(o.id)); } finally { setBusy(false); } }} data-testid="verificar-cadena"><ShieldCheck size={16} />{busy ? "Verificando…" : "Verificar integridad"}</button>} />
      {verif && (
        <Panel className={`mb-5 border ${verif.facturacion.ok && verif.eventos.ok ? "!border-ok/50" : "!border-bad/60"}`}>
          {verif.facturacion.ok && verif.eventos.ok ? (
            <p className="flex items-center gap-2 text-ok font-medium" data-testid="cadena-ok"><CheckCircle2 size={18} />Cadena íntegra: {verif.facturacion.registrosComprobados} {verif.facturacion.registrosComprobados === 1 ? "registro" : "registros"} de facturación (huella, firma, encadenado y fechas) y {eventos.length} eventos comprobados.</p>
          ) : (<>
            <p className="flex items-center gap-2 text-bad font-medium"><XCircle size={18} />Se han detectado anomalías. Se ha generado el registro de evento correspondiente y una alarma persistente.</p>
            <ul className="mt-3 text-sm space-y-1">{[...verif.facturacion.anomalias.map((a) => ({ ...a, d: "Facturación" })), ...verif.eventos.anomalias.map((a) => ({ ...a, d: "Eventos" }))].map((a, i) => (
              <li key={i}><Chip tono="bad">{a.tipo}</Chip> <span className="text-muted">{a.d} #{a.indice + 1}</span> · {TIPO_ANOMALIA[a.tipo as TipoAnomalia]} — {a.mensaje}</li>))}</ul>
          </>)}
        </Panel>)}

      {regs.length === 0 ? <Panel><Vacio icono={<Link2 />} titulo="La cadena está vacía" texto="El primer registro se generará al emitir tu primera factura." /></Panel> : (
        <div className="grid lg:grid-cols-[1fr_380px] gap-5 items-start">
          <Panel className="!p-0 overflow-hidden">
            <div className="overflow-x-auto max-h-[560px]"><table className="w-full text-sm">
              <thead className="sticky top-0 bg-bg/80 backdrop-blur"><tr className="text-left text-xs text-muted"><th className="px-4 py-3 font-medium">#</th><th className="font-medium">Tipo</th><th className="font-medium">Factura</th><th className="font-medium hidden md:table-cell">Generado</th><th className="px-4 font-medium">Huella</th></tr></thead>
              <tbody>{regs.map((x, i) => (
                <tr key={x.id} className={`fila cursor-pointer ${i === sel ? "bg-accent/10" : ""}`} onClick={() => ir(i)}>
                  <td className="px-4 py-2.5 text-muted tabular-nums">{i + 1}</td>
                  <td><Chip tono={x.tipo === "alta" ? "acc" : "bad"}>{x.tipo}</Chip></td>
                  <td className="font-mono">{x.numSerie}</td>
                  <td className="text-muted hidden md:table-cell">{fechaHora(x.fechaHoraGen)}</td>
                  <td className="px-4 font-mono text-xs">{corto(x.huella)}</td>
                </tr>))}</tbody>
            </table></div>
          </Panel>
          {r && <Panel>
            <div className="flex items-center justify-between">
              <button className="btn-ghost h-9" disabled={!ant} onClick={() => ir(sel - 1)} aria-label="Registro anterior"><ArrowLeft size={16} />Anterior</button>
              <span className="text-sm text-muted">Registro {sel + 1} de {regs.length}</span>
              <button className="btn-ghost h-9" disabled={!post} onClick={() => ir(sel + 1)} aria-label="Registro posterior">Posterior<ArrowRight size={16} /></button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              {[["Enlace con el anterior", ant], ["Enlace con el posterior", post]].map(([l, s]) => {
                const x = s as ReturnType<typeof saltar>;
                return <div key={l as string} className="rounded-2xl bg-glass/[.04] border border-line/10 p-3"><div className="text-muted">{l as string}</div>
                  {!x ? <div className="mt-1">—</div> : <><div className={`mt-1 flex items-center gap-1 ${x.huellaCorrecta ? "text-ok" : "text-bad"}`}>{x.huellaCorrecta ? <CheckCircle2 size={13} /> : <XCircle size={13} />}Huella</div>
                    <div className={`flex items-center gap-1 ${x.ordenTemporalCorrecto ? "text-ok" : "text-bad"}`}>{x.ordenTemporalCorrecto ? <CheckCircle2 size={13} /> : <XCircle size={13} />}Orden temporal</div></>}</div>;
              })}
            </div>
            <dl className="mt-4 text-xs space-y-2">
              <div><dt className="text-muted">Factura</dt><dd className="font-mono">{r.facturaId ? <Link className="text-accent" to={`/facturas/${r.facturaId}`}>{r.numSerie}</Link> : r.numSerie}</dd></div>
              <div><dt className="text-muted">FechaHoraHusoGenRegistro</dt><dd className="font-mono">{r.fechaHoraGen}</dd></div>
              <div><dt className="text-muted">Huella (SHA-256)</dt><dd className="font-mono break-all">{r.huella}</dd></div>
              <div><dt className="text-muted">Huella del registro anterior</dt><dd className="font-mono break-all">{r.huellaAnterior ?? "— Primer registro de la cadena"}</dd></div>
              <div><dt className="text-muted">Firma</dt><dd>{r.firmado ? <Chip tono="ok">XAdES-EPES</Chip> : <Chip>Sin firma</Chip>}</dd></div>
            </dl>
            <button className="btn-ghost w-full mt-4" onClick={() => descargar(`${r.numSerie}-${r.tipo}.xml`, r.xml)}><Download size={16} />Descargar XML</button>
          </Panel>}
        </div>)}

      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Panel>
          <h2 className="font-semibold">Exportar registros de un periodo</h2>
          <p className="text-sm text-muted mt-1">Copia fiel y legible (XML según los esquemas de la AEAT) para conservar fuera del equipo o entregar a la inspección (art. 8.2 Orden). Genera el evento 08.</p>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <input className="input" type="date" value={per.desde} onChange={(e) => setPer({ ...per, desde: e.target.value })} aria-label="Desde" />
            <input className="input" type="date" value={per.hasta} onChange={(e) => setPer({ ...per, hasta: e.target.value })} aria-label="Hasta" />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button className="btn-primary" onClick={async () => { try { const ex = await store.exportarRegistros(o.id, per.desde, per.hasta); descargar(`astrofact-registros-${per.desde}_${per.hasta}.zip`, zip(ex.ficheros), "application/zip"); toast(`${ex.resumen.numAltas + ex.resumen.numAnulaciones} registros exportados`); } catch (e) { toast((e as Error).message, "error"); } }}><Download size={16} />Exportar registros</button>
            <button className="btn-ghost" onClick={async () => { try { descargar("astrofact-eventos.zip", zip(await store.exportarEventos(o.id)), "application/zip"); toast("Eventos exportados"); } catch (e) { toast((e as Error).message, "error"); } }}>Exportar eventos</button>
          </div>
        </Panel>
        <Panel className="!p-0 overflow-hidden">
          <h2 className="font-semibold px-5 pt-5">Registro de eventos</h2>
          <ul className="mt-3 max-h-72 overflow-auto text-sm">{eventos.map((e) => (
            <li key={e.id} className="fila px-5 py-2.5 flex items-start gap-3">
              <span className="kbd mt-0.5">{e.tipo}</span>
              <div className="flex-1 min-w-0"><div className="truncate">{TIPO_EVENTO[e.tipo]}</div><div className="text-xs text-muted">{fechaHora(e.fechaHoraGen)} · {corto(e.huella)}</div></div>
              {e.firmado ? <CheckCircle2 size={15} className="text-ok shrink-0" aria-label="Firmado" /> : <span className="text-[10px] text-warn">pendiente de firma</span>}
            </li>))}</ul>
        </Panel>
      </div>
    </>
  );
}
