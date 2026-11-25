import { useState } from "react";
import { FileDown, ImagePlus, Palette, Trash2 } from "lucide-react";
import type { PlantillaGuardada } from "@astrofact/db";
import { useApp } from "../state/app";
import { Campo, Panel } from "../ui/kit";
import DocumentoFactura from "./DocumentoFactura";
import { facturaMuestra } from "../pages/muestra";
import { aB64, pdfDeFactura } from "../platform/pdf";
import { descargar } from "../platform/storage";

const COLORES = ["#6C63FF", "#00A3FF", "#0B7285", "#2F9E44", "#E8590C", "#C2255C", "#212529"];
const ESTILOS: { id: PlantillaGuardada["estilo"]; nombre: string; desc: string }[] = [
  { id: "moderna", nombre: "Moderna", desc: "Acento de color, tabla con cabecera rellena" },
  { id: "clasica", nombre: "Clásica", desc: "Sobria, con filetes y recuadros" },
  { id: "minimal", nombre: "Minimal", desc: "Solo tipografía y líneas finas" },
];

export default function EditorPlantilla() {
  const { store, obligado: o, toast } = useApp();
  const [p, setP] = useState<PlantillaGuardada>(store.plantilla(o.id));
  const [err, setErr] = useState<string>();
  const muestra = facturaMuestra(o);
  return (
    <div className="grid xl:grid-cols-[380px_1fr] gap-5 items-start">
      <Panel className="space-y-5">
        <h2 className="font-semibold flex items-center gap-2"><Palette size={18} className="text-accent" />Plantilla de factura</h2>
        <div className="grid gap-2">{ESTILOS.map((e) => (
          <button key={e.id} onClick={() => setP({ ...p, estilo: e.id })} className={`glass !rounded-2xl p-3 text-left transition ${p.estilo === e.id ? "ring-2 ring-accent" : "opacity-80 hover:opacity-100"}`} data-testid={`estilo-${e.id}`}>
            <div className="font-medium text-sm">{e.nombre}</div><div className="text-xs text-muted">{e.desc}</div></button>))}</div>
        <div><span className="label">Color de acento</span>
          <div className="flex flex-wrap items-center gap-2">{COLORES.map((c) => (
            <button key={c} aria-label={`Color ${c}`} onClick={() => setP({ ...p, colorAcento: c })} className={`h-8 w-8 rounded-full border-2 transition ${p.colorAcento.toLowerCase() === c.toLowerCase() ? "border-fg scale-110" : "border-transparent"}`} style={{ background: c }} />))}
            <input type="color" value={p.colorAcento} onChange={(e) => setP({ ...p, colorAcento: e.target.value })} className="h-8 w-10 rounded-lg bg-transparent" aria-label="Color personalizado" />
          </div></div>
        <div><span className="label">Logo (PNG o JPG, máx. 500 KB)</span>
          <div className="flex items-center gap-2">
            <label className="btn-ghost cursor-pointer"><ImagePlus size={16} />Subir logo<input type="file" accept="image/png,image/jpeg" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0]; if (!f) return;
              if (f.size > 500_000) { setErr("El logo supera 500 KB"); return; }
              setP({ ...p, logoB64: aB64(new Uint8Array(await f.arrayBuffer())), logoTipo: f.type === "image/png" ? "png" : "jpg" }); setErr(undefined); }} /></label>
            {p.logoB64 && <button className="btn-ghost h-9 w-9 px-0" aria-label="Quitar logo" onClick={() => setP({ ...p, logoB64: undefined, logoTipo: undefined })}><Trash2 size={15} /></button>}
          </div></div>
        <Campo label="Notas (forma de pago, agradecimiento…)"><textarea className="input h-20 py-2" value={p.notas ?? ""} onChange={(e) => setP({ ...p, notas: e.target.value || undefined })} /></Campo>
        <Campo label="Pie legal" ayuda="p. ej. datos de inscripción en el Registro Mercantil"><input className="input" value={p.pieLegal ?? ""} onChange={(e) => setP({ ...p, pieLegal: e.target.value || undefined })} /></Campo>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-4 w-4" checked={p.mostrarIban} onChange={(e) => setP({ ...p, mostrarIban: e.target.checked })} />Mostrar IBAN como forma de pago</label>
        <p className="text-xs text-muted">El QR tributario y sus textos tienen posición y tamaño fijos (art. 20–21 Orden HAC/1177/2024): ninguna plantilla los mueve.</p>
        {err && <p className="text-sm text-bad">{err}</p>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={async () => { try { await store.guardarPlantilla(o.id, p); toast("Plantilla guardada"); } catch (e) { setErr((e as Error).message); } }}>Guardar plantilla</button>
          <button className="btn-ghost" onClick={async () => descargar("muestra-plantilla.pdf", await pdfDeFactura(muestra, o, p), "application/pdf")}><FileDown size={16} />PDF de muestra</button>
        </div>
      </Panel>
      <div className="glass p-3 sm:p-5 flex justify-center overflow-hidden [--s:.42] sm:[--s:.6] 2xl:[--s:.75]">
        <div className="relative" style={{ width: "calc(210mm * var(--s))", height: "calc(297mm * var(--s))" }}>
          <div className="absolute top-0 left-0 origin-top-left w-[210mm]" style={{ transform: "scale(var(--s))" }}><DocumentoFactura f={muestra} o={o} p={p} /></div>
        </div>
      </div>
    </div>
  );
}
