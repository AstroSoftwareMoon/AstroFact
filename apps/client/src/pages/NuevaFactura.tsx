import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AlertCircle, Info, Plus, Send, Trash2, UserPlus } from "lucide-react";
import { calcularTotales, RECARGO_POR_TIPO_IVA, D, type LineaFactura, type TipoFactura } from "@astrofact/fiscal-core";
import { ErrorValidacion, type BorradorUI } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Modal, Panel, Titulo } from "../ui/kit";
import { euros } from "../format";
import { FormTercero } from "./Clientes";

/** Opciones de impuesto por línea → campos fiscales del registro (L1, L9, L10). */
const IMPUESTOS: Record<string, { label: string; l: Partial<LineaFactura> }> = {
  "iva21": { label: "IVA 21 %", l: { impuesto: "01", tipo: "21" } },
  "iva10": { label: "IVA 10 %", l: { impuesto: "01", tipo: "10" } },
  "iva4": { label: "IVA 4 %", l: { impuesto: "01", tipo: "4" } },
  "iva0": { label: "IVA 0 %", l: { impuesto: "01", tipo: "0" } },
  "e1": { label: "Exenta art. 20 LIVA (E1)", l: { impuesto: "01", exenta: "E1" } },
  "e5": { label: "Exenta entrega intracomunitaria art. 25 (E5)", l: { impuesto: "01", exenta: "E5" } },
  "e2": { label: "Exenta exportación art. 21 (E2)", l: { impuesto: "01", exenta: "E2", claveRegimen: "02" } },
  "s2": { label: "Inversión del sujeto pasivo (ISP)", l: { impuesto: "01", calificacion: "S2" } },
  "n1": { label: "No sujeta (art. 7, 14…) (N1)", l: { impuesto: "01", calificacion: "N1" } },
  "n2": { label: "No sujeta por localización (N2)", l: { impuesto: "01", calificacion: "N2" } },
  "igic7": { label: "IGIC 7 %", l: { impuesto: "03", tipo: "7" } },
  "igic3": { label: "IGIC 3 %", l: { impuesto: "03", tipo: "3" } },
  "igic0": { label: "IGIC 0 %", l: { impuesto: "03", tipo: "0" } },
  "igic15": { label: "IGIC 15 %", l: { impuesto: "03", tipo: "15" } },
};
const claveDe = (l: LineaFactura) => Object.entries(IMPUESTOS).find(([, v]) => v.l.impuesto === (l.impuesto ?? "01") && v.l.tipo === l.tipo && v.l.exenta === l.exenta && (v.l.calificacion ?? "S1") === (l.calificacion ?? "S1"))?.[0] ?? "iva21";
const lineaVacia = (): LineaFactura => ({ descripcion: "", cantidad: "1", precioUnitario: "0", impuesto: "01", tipo: "21" });

export default function NuevaFactura() {
  const { store, obligado: o, toast } = useApp();
  const nav = useNavigate();
  const loc = useLocation() as { state?: { borrador?: BorradorUI } };
  const inicial = loc.state?.borrador;
  const esRect = !!inicial?.rectificacion;
  const [b, setB] = useState<BorradorUI>(inicial ?? { tipoFactura: "F1", descripcionOperacion: "", lineas: [lineaVacia()] });
  const series = store.series(o.id).filter((s) => s.activa && (esRect ? s.clase === "rectificativa" : s.clase !== "rectificativa"));
  const [serieId, setSerieId] = useState<number | undefined>(series.find((s) => (b.tipoFactura === "F2" ? s.clase === "simplificada" : true))?.id ?? series[0]?.id);
  const [confirmar, setConfirmar] = useState(false);
  const [nuevoCli, setNuevoCli] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errEmit, setErrEmit] = useState<string>();
  const clientes = store.terceros(o.id).filter((c) => c.tipo !== "proveedor");
  const productos = store.productos(o.id);
  const cli = b.terceroId ? store.tercero(b.terceroId) : undefined;
  useEffect(() => { if (!serieId && series[0]) setSerieId(series[0].id); }, [series, serieId]);

  const set = (p: Partial<BorradorUI>) => setB((x) => ({ ...x, ...p }));
  const setLinea = (i: number, p: Partial<LineaFactura>) => setB((x) => ({ ...x, lineas: x.lineas.map((l, j) => (j === i ? { ...l, ...p } : l)) }));
  const aplicarImpuesto = (i: number, k: string) => {
    const base = IMPUESTOS[k]!.l;
    const l: LineaFactura = { ...b.lineas[i]!, impuesto: base.impuesto, tipo: base.tipo, exenta: base.exenta, calificacion: base.calificacion, claveRegimen: base.claveRegimen, recargo: undefined };
    if (cli?.recargoEquivalencia && l.impuesto === "01" && l.tipo && !l.exenta) l.recargo = RECARGO_POR_TIPO_IVA[l.tipo]?.[0];
    setB((x) => ({ ...x, lineas: x.lineas.map((y, j) => (j === i ? l : y)) }));
  };
  const elegirCliente = (id?: number) => {
    const c = id ? store.tercero(id) : undefined;
    setB((x) => ({ ...x, terceroId: id, destinatarios: undefined, retencionPct: c?.retencionPct ?? x.retencionPct,
      lineas: x.lineas.map((l) => ({ ...l, recargo: c?.recargoEquivalencia && l.impuesto === "01" && l.tipo && !l.exenta ? RECARGO_POR_TIPO_IVA[l.tipo]?.[0] : undefined })) }));
  };

  const totales = useMemo(() => { try { return calcularTotales(b); } catch { return null; } }, [b]);
  const incidencias = useMemo(() => { try { return store.validar(o.id, b); } catch (e) { return [{ nivel: "error" as const, codigo: "X", mensaje: (e as Error).message, regla: "" }]; } }, [b, store, o.id]);
  const errores = incidencias.filter((i) => i.nivel === "error");
  const avisos = incidencias.filter((i) => i.nivel === "aviso");

  async function emitir() {
    setBusy(true); setErrEmit(undefined);
    try {
      const f = await store.emitir(o.id, serieId!, b);
      toast(o.modo === "verifactu" ? `Factura ${f.numSerie} emitida: registro en cola de envío a la AEAT` : `Factura ${f.numSerie} emitida y registro firmado`);
      nav(`/facturas/${f.id}`, { replace: true });
    } catch (e) {
      const inc = e instanceof ErrorValidacion ? e.incidencias : (e as { incidencias?: { nivel: string; mensaje: string }[] }).incidencias;
      setErrEmit(inc?.length ? inc.filter((i) => i.nivel === "error").map((i) => i.mensaje).join(" · ") : (e as Error).message);
    }
    finally { setBusy(false); }
  }

  return (
    <>
      <Titulo titulo={esRect ? "Nueva factura rectificativa" : "Nueva factura"} sub="Revisa los datos: al emitir se genera el registro de facturación encadenado y firmado, y ya no podrá modificarse." />
      <div className="grid lg:grid-cols-[1fr_340px] gap-5 items-start">
        <div className="space-y-5">
          <Panel>
            <div className="grid sm:grid-cols-3 gap-4">
              <Campo label="Tipo de factura">
                <select className="input" value={b.tipoFactura} onChange={(e) => { const tf = e.target.value as TipoFactura; set({ tipoFactura: tf, ...(tf === "F2" || tf === "R5" ? { terceroId: undefined } : {}) }); const s = series.find((x) => (tf === "F2" ? x.clase === "simplificada" : x.clase !== "simplificada")); if (s) setSerieId(s.id); }}>
                  {esRect ? (<><option value="R1">R1 · Error fundado en derecho / art. 80.1, 80.2, 80.6</option><option value="R2">R2 · Concurso de acreedores (art. 80.3)</option><option value="R3">R3 · Créditos incobrables (art. 80.4)</option><option value="R4">R4 · Resto de causas</option><option value="R5">R5 · Rectificativa de simplificada</option></>)
                    : (<><option value="F1">Completa (F1)</option><option value="F2">Simplificada (F2)</option></>)}
                </select>
              </Campo>
              <Campo label="Serie"><select className="input" value={serieId} onChange={(e) => setSerieId(Number(e.target.value))}>{series.map((s) => <option key={s.id} value={s.id}>{s.codigo} · siguiente nº {s.ultimoNumero + 1}</option>)}</select></Campo>
              <Campo label="Fecha de expedición"><input className="input" type="date" value={b.fechaExpedicion ?? store.hoy(o.id)} max={store.hoy(o.id)} onChange={(e) => set({ fechaExpedicion: e.target.value })} /></Campo>
            </div>
            {b.tipoFactura !== "F2" && b.tipoFactura !== "R5" && (
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 mt-4 items-end">
                <Campo label="Cliente"><select className="input" value={b.terceroId ?? ""} onChange={(e) => elegirCliente(e.target.value ? Number(e.target.value) : undefined)} data-testid="select-cliente">
                  <option value="">Selecciona un cliente…</option>{clientes.map((c) => <option key={c.id} value={c.id}>{c.nombre}{c.nif ? ` · ${c.nif}` : ""}</option>)}</select></Campo>
                <button className="btn-ghost" onClick={() => setNuevoCli(true)}><UserPlus size={16} />Nuevo cliente</button>
              </div>)}
            {cli?.recargoEquivalencia && <p className="text-xs text-accent mt-2">Cliente en recargo de equivalencia: se aplica automáticamente.</p>}
            <div className="mt-4"><Campo label="Descripción de la operación (obligatoria en el registro)"><input className="input" value={b.descripcionOperacion} onChange={(e) => set({ descripcionOperacion: e.target.value })} placeholder="p. ej. Servicios de diseño de marzo" maxLength={500} /></Campo></div>
            {esRect && b.rectificacion && <p className="mt-3 text-sm text-muted">Rectifica a <b className="font-mono">{b.rectificacion.facturas.map((f) => f.NumSerieFactura).join(", ")}</b> · {b.rectificacion.tipo === "S" ? "por sustitución: indica los importes correctos completos" : "por diferencias: indica solo la diferencia (puede ser negativa)"}.</p>}
          </Panel>

          <Panel className="!p-0">
            <div className="px-5 pt-5 flex items-center justify-between"><h2 className="font-semibold">Líneas</h2>
              {productos.length > 0 && <select className="input-sm max-w-[220px]" value="" onChange={(e) => { const p = store.producto(Number(e.target.value)); if (!p) return; const l: LineaFactura = { descripcion: p.nombre, cantidad: "1", precioUnitario: p.precio, impuesto: p.impuesto, tipo: p.tipo, calificacion: p.calificacion, exenta: p.exenta as LineaFactura["exenta"], sujetaRetencion: p.sujetaRetencion };
                setB((x) => ({ ...x, lineas: [...x.lineas.filter((y) => y.descripcion || D(y.precioUnitario || "0").sign() !== 0), l] })); }}>
                <option value="">+ Añadir del catálogo…</option>{productos.map((p) => <option key={p.id} value={p.id}>{p.nombre} · {euros(p.precio)}</option>)}</select>}
            </div>
            <div className="p-3 sm:p-5 space-y-3">
              {b.lineas.map((l, i) => (
                <div key={i} className="grid grid-cols-6 md:grid-cols-[1fr_80px_110px_70px_170px_36px] gap-2 items-end rounded-2xl p-3 bg-glass/[.03] border border-line/10">
                  <div className="col-span-6 md:col-span-1"><Campo label="Concepto"><input className="input-sm" value={l.descripcion} onChange={(e) => setLinea(i, { descripcion: e.target.value })} placeholder="Descripción" aria-label={`Concepto línea ${i + 1}`} /></Campo></div>
                  <div className="col-span-2 md:col-span-1"><Campo label="Cant."><input className="input-sm text-right tabular-nums" inputMode="decimal" value={l.cantidad} onChange={(e) => setLinea(i, { cantidad: e.target.value })} /></Campo></div>
                  <div className="col-span-2 md:col-span-1"><Campo label="Precio"><input className="input-sm text-right tabular-nums" inputMode="decimal" value={l.precioUnitario} onChange={(e) => setLinea(i, { precioUnitario: e.target.value })} aria-label={`Precio línea ${i + 1}`} /></Campo></div>
                  <div className="col-span-2 md:col-span-1"><Campo label="Dto. %"><input className="input-sm text-right" inputMode="decimal" value={l.descuentoPct ?? ""} onChange={(e) => setLinea(i, { descuentoPct: e.target.value || undefined })} /></Campo></div>
                  <div className="col-span-5 md:col-span-1"><Campo label="Impuesto"><select className="input-sm" value={claveDe(l)} onChange={(e) => aplicarImpuesto(i, e.target.value)}>
                    {Object.entries(IMPUESTOS).filter(([k]) => o.territorio === "canarias" || !k.startsWith("igic")).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select></Campo></div>
                  <button className="btn-ghost h-9 w-9 px-0 col-span-1" onClick={() => setB((x) => ({ ...x, lineas: x.lineas.filter((_, j) => j !== i) }))} aria-label="Eliminar línea" disabled={b.lineas.length === 1}><Trash2 size={15} /></button>
                </div>))}
              <button className="btn-ghost w-full border-dashed" onClick={() => setB((x) => ({ ...x, lineas: [...x.lineas, lineaVacia()] }))}><Plus size={16} />Añadir línea</button>
            </div>
          </Panel>
        </div>

        <div className="space-y-5 lg:sticky lg:top-6">
          <Panel>
            <h2 className="font-semibold mb-3">Totales</h2>
            <Campo label="Retención IRPF"><select className="input" value={b.retencionPct ?? ""} onChange={(e) => set({ retencionPct: e.target.value || undefined })}>
              <option value="">Sin retención</option><option value="1">1 %</option><option value="2">2 %</option><option value="7">7 % (inicio de actividad)</option><option value="15">15 %</option><option value="19">19 %</option></select></Campo>
            {totales && <dl className="mt-4 space-y-1.5 text-sm tabular-nums">
              <div className="flex justify-between text-muted"><dt>Base imponible</dt><dd>{euros(totales.baseTotal.toFixed(2))}</dd></div>
              {totales.desglose.filter((g) => !g.cuota.isZero()).map((g, i) => <div key={i} className="flex justify-between text-muted"><dt>{g.impuesto === "03" ? "IGIC" : "IVA"} {g.tipo?.toPlain()} %</dt><dd>{euros(g.cuota.toFixed(2))}</dd></div>)}
              {totales.desglose.filter((g) => !g.cuotaRecargo.isZero()).map((g, i) => <div key={`r${i}`} className="flex justify-between text-muted"><dt>Recargo {g.recargo?.toPlain()} %</dt><dd>{euros(g.cuotaRecargo.toFixed(2))}</dd></div>)}
              <div className="flex justify-between font-semibold text-base pt-2 border-t border-line/10"><dt>Importe total</dt><dd data-testid="importe-total">{euros(totales.importeTotal.toFixed(2))}</dd></div>
              {!totales.retencion.isZero() && <><div className="flex justify-between text-muted"><dt>Retención IRPF</dt><dd>−{euros(totales.retencion.toFixed(2))}</dd></div>
                <div className="flex justify-between font-semibold text-lg text-accent"><dt>Total a pagar</dt><dd>{euros(totales.totalAPagar.toFixed(2))}</dd></div></>}
            </dl>}
            <p className="text-[11px] text-muted mt-3 flex gap-1.5"><Info size={13} className="shrink-0 mt-0.5" />La retención no forma parte del «ImporteTotal» del registro ni del QR (FAQ AEAT).</p>
          </Panel>
          {(errores.length > 0 || avisos.length > 0) && (
            <Panel className="!p-4 space-y-2 text-sm">
              {errores.map((e, i) => <p key={i} className="flex gap-2 text-bad"><AlertCircle size={15} className="shrink-0 mt-0.5" /><span>{e.mensaje}</span></p>)}
              {avisos.map((e, i) => <p key={`a${i}`} className="flex gap-2 text-warn"><Info size={15} className="shrink-0 mt-0.5" /><span>{e.mensaje}</span></p>)}
            </Panel>)}
          <button className="btn-primary w-full h-12 text-base" disabled={errores.length > 0 || !serieId} onClick={() => setConfirmar(true)}><Send size={17} />Emitir factura</button>
        </div>
      </div>

      <Modal abierto={confirmar} onClose={() => setConfirmar(false)} titulo="¿Emitir la factura?">
        <p className="text-sm text-muted">Se asignará el número definitivo y se generará el <b className="text-fg">registro de facturación</b> encadenado con huella SHA-256, que {o.modo === "verifactu" ? <>se <b className="text-fg">enviará automáticamente a la AEAT</b></> : "se firmará con tu certificado"}. Una factura emitida <b className="text-fg">no se puede modificar ni borrar</b>: solo rectificar o anular.</p>
        {totales && <p className="mt-4 text-2xl font-semibold tabular-nums">{euros(totales.importeTotal.toFixed(2))}</p>}
        {errEmit && <p className="mt-3 text-sm text-bad" role="alert">{errEmit}</p>}
        <div className="flex justify-end gap-2 mt-6"><button className="btn-ghost" onClick={() => setConfirmar(false)}>Revisar</button><button className="btn-primary" onClick={emitir} disabled={busy} data-testid="confirmar-emision">{busy ? "Emitiendo…" : o.modo === "verifactu" ? "Emitir" : "Emitir y firmar"}</button></div>
      </Modal>
      <Modal abierto={nuevoCli} onClose={() => setNuevoCli(false)} titulo="Nuevo cliente" ancho="max-w-2xl">
        <FormTercero onGuardado={(c) => { setNuevoCli(false); elegirCliente(c.id); }} onCancel={() => setNuevoCli(false)} />
      </Modal>
    </>
  );
}
