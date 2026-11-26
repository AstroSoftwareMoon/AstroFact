import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlarmClock, Banknote, Check, Landmark, Mail, MessageCircle, Upload } from "lucide-react";
import { leerCsv, leerXlsx } from "@astrofact/informes";
import { textoRecordatorio, type Factura } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Chip, Modal, Panel, Titulo, Vacio } from "../ui/kit";
import { euros, fecha } from "../format";

/** Convierte un extracto bancario (CSV/XLSX) en movimientos: detecta columnas de fecha, concepto e importe (o cargo/abono). */
export function movimientosDeTabla(filas: string[][]): { fecha: string; concepto: string; importe: string }[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
  const iCab = filas.findIndex((f) => f.some((c) => /fecha/.test(norm(c))) && f.some((c) => /importe|cargo|abono|cantidad|haber|debe/.test(norm(c))));
  if (iCab < 0) throw new Error("No se encuentran las columnas de fecha e importe en el extracto");
  const cab = filas[iCab]!.map(norm);
  const col = (re: RegExp) => cab.findIndex((c) => re.test(c));
  const cF = col(/^fecha( operacion| valor)?$|^fecha/), cC = col(/concepto|descripcion|detalle|movimiento/), cI = col(/^importe|cantidad/);
  const cCargo = col(/cargo|debe/), cAbono = col(/abono|haber/);
  const num = (s?: string) => { if (!s) return 0; let t = s.replace(/[€\s]/g, ""); if (/,\d{1,2}$/.test(t)) t = t.replace(/\./g, "").replace(",", "."); return Number(t) || 0; };
  const iso = (s: string) => { const m = s.trim().match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); if (m) return `${m[3]!.length === 2 ? "20" + m[3] : m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10); const n = Number(s); if (n > 30000 && n < 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000).toISOString().slice(0, 10); return ""; };
  return filas.slice(iCab + 1).map((f) => {
    const imp = cI >= 0 ? num(f[cI]) : num(f[cAbono]) - num(f[cCargo]);
    return { fecha: iso(f[cF] ?? ""), concepto: (cC >= 0 ? f[cC] : "") ?? "", importe: imp.toFixed(2) };
  }).filter((m) => m.fecha && Number(m.importe) !== 0);
}

export default function Cobros() {
  const { store, obligado: o, toast, puede, modo } = useApp();
  const nav = useNavigate();
  const escribir = puede("contable");
  const vencidas = store.facturasVencidas(o.id);
  const pendientes = store.facturas(o.id).filter((f) => !f.anulada && f.estadoCobro !== "cobrada" && Number(f.totales.totalAPagar) > 0);
  const sugerencias = store.sugerenciasConciliacion(o.id);
  const movs = store.movimientos(o.id, true);
  const [cobro, setCobro] = useState<Factura | null>(null);
  const [c, setC] = useState({ fecha: store.hoy(o.id), importe: "", medio: "Transferencia" });
  const [err, setErr] = useState<string>();
  const totalPend = useMemo(() => pendientes.reduce((a, f) => a + Number(store.pendienteDeCobro(f.id)), 0), [pendientes, store]);
  const recordar = async (f: Factura & { diasVencida: number }, canal: "email" | "whatsapp") => {
    const t = textoRecordatorio(f, o.nombre, o.iban, f.diasVencida);
    const cli = f.terceroId ? store.tercero(f.terceroId) : undefined;
    if (canal === "email") window.open(`mailto:${encodeURIComponent(cli?.email ?? "")}?subject=${encodeURIComponent(t.asunto)}&body=${encodeURIComponent(t.cuerpo)}`);
    else window.open(`https://wa.me/${(cli?.telefono ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(t.cuerpo)}`, "_blank", "noopener");
    await store.registrarRecordatorio(f.id, canal);
  };
  const importar = async (file: File) => {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const filas = /\.xlsx$/i.test(file.name) ? await leerXlsx(bytes) : leerCsv(new TextDecoder(/latin|1252/i.test(file.name) ? "windows-1252" : "utf-8").decode(bytes));
      const r = await store.importarMovimientos(o.id, movimientosDeTabla(filas));
      toast(`${r.nuevos} movimientos importados${r.duplicados ? ` · ${r.duplicados} ya estaban` : ""}`);
    } catch (e) { toast((e as Error).message, "error"); }
  };
  return (
    <>
      <Titulo titulo="Cobros e impagos" sub="Controla lo que te deben, envía recordatorios y concilia con tu banco." />
      <div className="grid sm:grid-cols-3 gap-3 mb-5">
        <Panel><div className="text-xs text-muted">Pendiente de cobro</div><div className="text-2xl font-semibold tabular-nums mt-1">{euros(totalPend)}</div><div className="text-xs text-muted">{pendientes.length} facturas</div></Panel>
        <Panel><div className="text-xs text-muted">Vencidas</div><div className={`text-2xl font-semibold tabular-nums mt-1 ${vencidas.length ? "text-bad" : ""}`}>{euros(vencidas.reduce((a, f) => a + Number(f.pendiente), 0))}</div><div className="text-xs text-muted">{vencidas.length} facturas</div></Panel>
        <Panel><div className="text-xs text-muted">Movimientos sin conciliar</div><div className="text-2xl font-semibold tabular-nums mt-1">{movs.length}</div><div className="text-xs text-muted">{sugerencias.length} sugerencias</div></Panel>
      </div>

      <Panel className="!p-0 overflow-hidden">
        <h2 className="font-semibold px-5 pt-5 flex items-center gap-2"><AlarmClock size={17} className="text-accent" />Pendientes de cobro</h2>
        {pendientes.length === 0 ? <Vacio icono={<Banknote />} titulo="Todo cobrado" texto="No hay facturas pendientes de cobro." /> : (
          <div className="overflow-x-auto mt-2"><table className="w-full text-sm"><tbody>{pendientes.map((f) => { const v = vencidas.find((x) => x.id === f.id); return (
            <tr key={f.id} className="fila">
              <td className="px-5 py-3 font-mono whitespace-nowrap cursor-pointer" onClick={() => nav(`/facturas/${f.id}`)}>{f.numSerie}</td>
              <td className="py-3 max-w-[200px] truncate">{f.datos.destinatarios?.[0]?.nombre ?? "—"}</td>
              <td className="py-3 text-muted hidden md:table-cell whitespace-nowrap">{fecha(f.fechaExpedicion)}</td>
              <td className="py-3">{v ? <Chip tono="bad">vencida {v.diasVencida} d{v.recordatorios ? ` · ${v.recordatorios} aviso${v.recordatorios > 1 ? "s" : ""}` : ""}</Chip> : <Chip tono="warn">{f.estadoCobro}</Chip>}</td>
              <td className="py-3 text-right tabular-nums font-medium">{euros(store.pendienteDeCobro(f.id))}</td>
              <td className="pr-4 py-3 text-right whitespace-nowrap space-x-1">
                {v && <><button className="btn-ghost h-8 w-8 px-0" title="Recordatorio por email" aria-label="Recordatorio por email" onClick={() => recordar(v, "email")}><Mail size={14} /></button>
                  <button className="btn-ghost h-8 w-8 px-0" title="Recordatorio por WhatsApp" aria-label="Recordatorio por WhatsApp" onClick={() => recordar(v, "whatsapp")}><MessageCircle size={14} /></button></>}
                {escribir && <button className="btn-primary h-8 text-xs" onClick={() => { setErr(undefined); setC({ fecha: store.hoy(o.id), importe: store.pendienteDeCobro(f.id), medio: "Transferencia" }); setCobro(f); }}><Check size={14} />Cobro</button>}
              </td>
            </tr>); })}</tbody></table></div>)}
      </Panel>

      <Panel className="mt-5">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold flex items-center gap-2"><Landmark size={17} className="text-accent" />Conciliación bancaria</h2>
          {escribir && <label className="btn-ghost cursor-pointer"><Upload size={16} />Importar extracto (CSV/XLSX)<input type="file" className="hidden" accept=".csv,.xlsx,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importar(f); e.target.value = ""; }} /></label>}</div>
        <p className="text-xs text-muted mt-1">Descarga el extracto desde tu banca online. El fichero se procesa en tu equipo{modo === "servidor" ? " y se guarda en tu servidor" : ""}: no se envía a terceros.</p>
        {sugerencias.length > 0 && <ul className="mt-4 space-y-2">{sugerencias.map((s) => { const m = movs.find((x) => x.id === s.movimientoId)!; return (
          <li key={`${s.movimientoId}-${s.tipo}-${s.id}`} className="rounded-2xl border border-line/10 bg-glass/[.03] p-3 flex flex-wrap items-center gap-3 text-sm">
            <div className="flex-1 min-w-[200px]"><div className="font-medium tabular-nums">{fecha(m?.fecha)} · {euros(m?.importe ?? "0")}</div><div className="text-xs text-muted truncate">{m?.concepto}</div></div>
            <div className="flex-1 min-w-[200px]">→ {s.etiqueta} <Chip tono={s.confianza === "alta" ? "ok" : "neutro"}>{s.confianza}</Chip></div>
            {escribir && <button className="btn-primary h-8 text-xs" onClick={async () => { await store.conciliar(s.movimientoId, s.tipo === "factura" ? { facturaId: s.id } : { gastoId: s.id }); toast("Conciliado"); }}>Conciliar</button>}
          </li>); })}</ul>}
        {movs.length > 0 && sugerencias.length === 0 && <p className="text-sm text-muted mt-4">Hay {movs.length} movimientos sin conciliar y ninguna coincidencia por importe.</p>}
      </Panel>

      <Modal abierto={!!cobro} onClose={() => setCobro(null)} titulo={`Registrar cobro · ${cobro?.numSerie ?? ""}`}>
        <form onSubmit={async (e) => { e.preventDefault(); try { await store.registrarCobro(cobro!.id, { fecha: c.fecha, importe: c.importe.replace(",", "."), medio: c.medio }); toast("Cobro registrado"); setCobro(null); } catch (x) { setErr((x as Error).message); } }}>
          <div className="grid sm:grid-cols-3 gap-4">
            <Campo label="Fecha"><input className="input" type="date" value={c.fecha} onChange={(e) => setC({ ...c, fecha: e.target.value })} /></Campo>
            <Campo label="Importe"><input className="input text-right tabular-nums" inputMode="decimal" value={c.importe} onChange={(e) => setC({ ...c, importe: e.target.value })} /></Campo>
            <Campo label="Medio"><select className="input" value={c.medio} onChange={(e) => setC({ ...c, medio: e.target.value })}><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option><option>Efectivo</option><option>Bizum</option></select></Campo>
          </div>
          {err && <p className="text-sm text-bad mt-3">{err}</p>}
          <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn-ghost" onClick={() => setCobro(null)}>Cancelar</button><button className="btn-primary">Registrar</button></div>
        </form>
      </Modal>
    </>
  );
}
