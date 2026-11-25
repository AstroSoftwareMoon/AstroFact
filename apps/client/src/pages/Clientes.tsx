import { useState } from "react";
import { Download, Plus, Search, ShieldAlert, Users } from "lucide-react";
import { validateNif } from "@astrofact/fiscal-core";
import type { Tercero } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Chip, Modal, Panel, Titulo, Vacio } from "../ui/kit";
import { descargar } from "../platform/storage";

export function FormTercero({ inicial, onGuardado, onCancel }: { inicial?: Tercero; onGuardado: (t: Tercero) => void; onCancel: () => void }) {
  const { store, obligado: o, toast } = useApp();
  const [t, setT] = useState<Partial<Tercero> & { nombre: string }>(inicial ?? { nombre: "", tipo: "cliente", recargoEquivalencia: false });
  const [extranjero, setExtranjero] = useState(!!inicial?.idOtro);
  const [err, setErr] = useState<string>();
  const nifR = t.nif ? validateNif(t.nif) : undefined;
  const d = t.direccion ?? {};
  return (
    <form onSubmit={async (e) => { e.preventDefault(); try { const r = await store.guardarTercero(o.id, extranjero ? { ...t, nif: undefined } : { ...t, idOtro: undefined }); toast("Cliente guardado"); onGuardado(r); } catch (x) { setErr((x as Error).message); } }}>
      <div className="grid sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2"><Campo label="Nombre o razón social"><input className="input" autoFocus value={t.nombre} onChange={(e) => setT({ ...t, nombre: e.target.value })} required /></Campo></div>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={extranjero} onChange={(e) => setExtranjero(e.target.checked)} className="h-4 w-4" />Cliente extranjero (sin NIF español)</label>
        {!extranjero ? (
          <Campo label="NIF" error={nifR && !nifR.valid ? nifR.reason : undefined} ayuda={nifR?.valid ? `✓ ${nifR.kind}` : undefined}><input className="input font-mono uppercase" value={t.nif ?? ""} onChange={(e) => setT({ ...t, nif: e.target.value })} /></Campo>
        ) : (<>
          <Campo label="País (ISO)"><input className="input uppercase" maxLength={2} value={t.idOtro?.codigoPais ?? ""} onChange={(e) => setT({ ...t, idOtro: { idType: t.idOtro?.idType ?? "02", id: t.idOtro?.id ?? "", codigoPais: e.target.value.toUpperCase() } })} /></Campo>
          <Campo label="Tipo de identificación"><select className="input" value={t.idOtro?.idType ?? "02"} onChange={(e) => setT({ ...t, idOtro: { ...(t.idOtro ?? { id: "" }), idType: e.target.value as "02" } })}>
            <option value="02">NIF-IVA (UE)</option><option value="03">Pasaporte</option><option value="04">Documento oficial del país</option><option value="05">Certificado de residencia</option><option value="06">Otro documento</option></select></Campo>
          <Campo label="Número de identificación"><input className="input font-mono" value={t.idOtro?.id ?? ""} onChange={(e) => setT({ ...t, idOtro: { ...(t.idOtro ?? { idType: "02" }), id: e.target.value } })} /></Campo>
        </>)}
        <Campo label="Email"><input className="input" type="email" value={t.email ?? ""} onChange={(e) => setT({ ...t, email: e.target.value })} /></Campo>
        <div className="sm:col-span-2"><Campo label="Dirección"><input className="input" value={d.linea1 ?? ""} onChange={(e) => setT({ ...t, direccion: { ...d, linea1: e.target.value } })} /></Campo></div>
        <Campo label="CP"><input className="input" value={d.cp ?? ""} onChange={(e) => setT({ ...t, direccion: { ...d, cp: e.target.value } })} /></Campo>
        <Campo label="Municipio"><input className="input" value={d.municipio ?? ""} onChange={(e) => setT({ ...t, direccion: { ...d, municipio: e.target.value } })} /></Campo>
        <Campo label="Forma de pago"><select className="input" value={t.formaPago ?? ""} onChange={(e) => setT({ ...t, formaPago: e.target.value || undefined })}><option value="">—</option><option>Transferencia</option><option>Domiciliación</option><option>Tarjeta</option><option>Efectivo</option><option>Bizum</option></select></Campo>
        <Campo label="Retención IRPF por defecto"><select className="input" value={t.retencionPct ?? ""} onChange={(e) => setT({ ...t, retencionPct: e.target.value || undefined })}><option value="">Sin retención</option><option value="7">7 %</option><option value="15">15 %</option><option value="19">19 %</option></select></Campo>
        <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={!!t.recargoEquivalencia} onChange={(e) => setT({ ...t, recargoEquivalencia: e.target.checked })} className="h-4 w-4" />Cliente en recargo de equivalencia (comercio minorista)</label>
      </div>
      {err && <p className="text-sm text-bad mt-3">{err}</p>}
      <div className="flex justify-end gap-2 mt-6"><button type="button" className="btn-ghost" onClick={onCancel}>Cancelar</button><button className="btn-primary">Guardar</button></div>
    </form>
  );
}

export default function Clientes() {
  const { store, obligado: o, toast, t } = useApp();
  const [q, setQ] = useState(""); const [edit, setEdit] = useState<Tercero | "nuevo" | null>(null); const [rgpd, setRgpd] = useState<Tercero | null>(null);
  const lista = store.terceros(o.id, q);
  return (
    <>
      <Titulo titulo="Clientes" acciones={<button className="btn-primary" onClick={() => setEdit("nuevo")}><Plus size={16} />Nuevo cliente</button>} />
      <Panel className="!p-0 overflow-hidden">
        <div className="p-4 border-b border-line/10"><div className="relative max-w-sm"><Search size={16} className="absolute left-3 top-3 text-muted" /><input className="input pl-9" placeholder={t("comun.buscar")} value={q} onChange={(e) => setQ(e.target.value)} /></div></div>
        {lista.length === 0 ? <Vacio icono={<Users />} titulo="Sin clientes" texto="Añade tu primer cliente; validamos el NIF al instante." /> : (
          <table className="w-full text-sm"><tbody>{lista.map((c) => (
            <tr key={c.id} className="fila">
              <td className="px-5 py-3 cursor-pointer" onClick={() => setEdit(c)}><div className="font-medium">{c.nombre}</div><div className="text-xs text-muted">{c.email ?? ""}</div></td>
              <td className="py-3 font-mono text-muted hidden sm:table-cell">{c.nif ?? (c.idOtro ? `${c.idOtro.codigoPais ?? ""} ${c.idOtro.id}` : "—")}</td>
              <td className="py-3 hidden md:table-cell">{c.recargoEquivalencia && <Chip tono="acc">R. equivalencia</Chip>} {c.anonimizadoEn && <Chip>Anonimizado</Chip>}</td>
              <td className="px-5 py-3 text-right"><button className="btn-ghost h-8 text-xs" onClick={() => setRgpd(c)}><ShieldAlert size={14} />RGPD</button></td>
            </tr>))}</tbody></table>)}
      </Panel>
      <Modal abierto={!!edit} onClose={() => setEdit(null)} titulo={edit === "nuevo" ? "Nuevo cliente" : "Editar cliente"} ancho="max-w-2xl">
        {edit && <FormTercero inicial={edit === "nuevo" ? undefined : edit} onGuardado={() => setEdit(null)} onCancel={() => setEdit(null)} />}
      </Modal>
      <Modal abierto={!!rgpd} onClose={() => setRgpd(null)} titulo="Derechos RGPD del cliente">
        {rgpd && <>
          <p className="text-sm text-muted">El cliente puede pedir <b className="text-fg">acceso</b> a sus datos o su <b className="text-fg">supresión</b>. Pero la ley obliga a conservar las facturas y sus registros durante el plazo legal (art. 19 RD 1619/2012, art. 8 Orden HAC/1177/2024, y art. 17.3.b RGPD como excepción). Por eso AstroFact <b className="text-fg">anonimiza los datos de contacto</b> del cliente y <b className="text-fg">conserva intactas</b> las facturas emitidas.</p>
          <div className="flex flex-wrap justify-end gap-2 mt-6">
            <button className="btn-ghost" onClick={async () => descargar(`datos-${rgpd.nombre}.json`, JSON.stringify(await store.exportarDatosTercero(rgpd.id), null, 2), "application/json")}><Download size={16} />Exportar sus datos</button>
            <button className="btn-danger" onClick={async () => { await store.anonimizarTercero(rgpd.id); toast("Datos de contacto anonimizados; facturas conservadas"); setRgpd(null); }}>Anonimizar</button>
          </div>
        </>}
      </Modal>
    </>
  );
}
