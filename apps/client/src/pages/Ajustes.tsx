import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { FileKey2, Languages, Lock, Moon, Plus, Scale, Sun } from "lucide-react";
import declaracion from "../../../../docs/cumplimiento/declaracion-responsable.md?raw";
import avisoLegal from "../../../../docs/aviso-legal.md?raw";
import { useApp } from "../state/app";
import EditorPlantilla from "../components/EditorPlantilla";
import Actualizaciones from "../components/Actualizaciones";
import { GestionUsuarios, MiCuenta } from "../components/CuentaServidor";
import { verifactuLocalDisponible } from "../platform/transporte";
import { Campo, Chip, Modal, Panel, Titulo } from "../ui/kit";
import { fecha } from "../format";
import { pref } from "../platform/storage";

export default function Ajustes() {
  const app = useApp();
  const { store, obligado: o, toast } = app;
  const loc = useLocation();
  const cert = store.certificado(o.id);
  const [neg, setNeg] = useState({ nombre: o.nombre, email: o.email ?? "", telefono: o.telefono ?? "", iban: o.iban ?? "", pieLegal: o.pieLegal ?? "", ...o.direccion });
  const [p12, setP12] = useState<{ f?: File; pass: string }>({ pass: "" });
  const [facturae, setFacturae] = useState(pref.get("facturae") === "1");
  const [serie, setSerie] = useState({ codigo: "", plantilla: "{serie}-{año}-{num:4}", clase: "ordinaria" as "ordinaria" });
  const [cif, setCif] = useState({ a: "", b: "" });
  const [doc, setDoc] = useState<"decl" | "aviso" | null>(null);
  const [err, setErr] = useState<string>();
  useEffect(() => { if (loc.hash) document.getElementById(loc.hash.slice(1))?.scrollIntoView({ behavior: "smooth" }); }, [loc.hash]);
  const accion = async (fn: () => Promise<unknown> | unknown, ok: string) => { setErr(undefined); try { await fn(); toast(ok); } catch (e) { setErr((e as Error).message); toast((e as Error).message, "error"); } };

  return (
    <>
      <Titulo titulo="Ajustes" />
      <div className="grid lg:grid-cols-2 gap-5">
        <Panel>
          <h2 className="font-semibold mb-4">Negocio</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="NIF" ayuda="No modificable: identifica la cadena de registros"><input className="input font-mono" value={o.nif} disabled /></Campo>
            <Campo label="Razón social"><input className="input" value={neg.nombre} onChange={(e) => setNeg({ ...neg, nombre: e.target.value })} /></Campo>
            <div className="sm:col-span-2"><Campo label="Dirección"><input className="input" value={neg.linea1 ?? ""} onChange={(e) => setNeg({ ...neg, linea1: e.target.value })} /></Campo></div>
            <Campo label="CP"><input className="input" value={neg.cp ?? ""} onChange={(e) => setNeg({ ...neg, cp: e.target.value })} /></Campo>
            <Campo label="Municipio"><input className="input" value={neg.municipio ?? ""} onChange={(e) => setNeg({ ...neg, municipio: e.target.value })} /></Campo>
            <Campo label="Email"><input className="input" value={neg.email} onChange={(e) => setNeg({ ...neg, email: e.target.value })} /></Campo>
            <Campo label="IBAN (para el pie de factura)"><input className="input font-mono" value={neg.iban} onChange={(e) => setNeg({ ...neg, iban: e.target.value })} /></Campo>
            <div className="sm:col-span-2"><Campo label="Pie legal" ayuda="p. ej. inscripción en el Registro Mercantil"><input className="input" value={neg.pieLegal} onChange={(e) => setNeg({ ...neg, pieLegal: e.target.value })} /></Campo></div>
          </div>
          <div className="flex items-center justify-between mt-4">
            <div className="flex gap-1.5"><Chip tono="acc">No VERI*FACTU</Chip><Chip tono={o.entorno === "pruebas" ? "warn" : "ok"}>{o.entorno}</Chip></div>
            <button className="btn-primary" onClick={() => accion(async () => store.actualizarObligado(o.id, { nombre: neg.nombre, email: neg.email || undefined, iban: neg.iban || undefined, pieLegal: neg.pieLegal || undefined, direccion: { linea1: neg.linea1, cp: neg.cp, municipio: neg.municipio, provincia: neg.provincia, pais: neg.pais } }), "Datos guardados")}>Guardar</button>
          </div>
        </Panel>

        <Panel id="certificado">
          <h2 className="font-semibold mb-1 flex items-center gap-2"><FileKey2 size={18} className="text-accent" />Certificado electrónico</h2>
          {cert ? (
            <div className="rounded-2xl bg-glass/[.04] border border-line/10 p-3 text-sm mt-3">
              <div className="font-medium">{cert.titular}</div>
              <div className="text-muted text-xs">NIF {cert.nif ?? "—"} · válido {fecha(cert.validoDesde)} – {fecha(cert.validoHasta)}</div>
              <div className="mt-2 flex gap-1.5">{cert.dePruebas && <Chip tono="warn">De pruebas</Chip>}<Chip tono={store.certificadoDesbloqueado(o.id) ? "ok" : "warn"}>{store.certificadoDesbloqueado(o.id) ? "Desbloqueado" : "Bloqueado"}</Chip></div>
            </div>) : <p className="text-sm text-muted mt-2">No hay certificado configurado.</p>}
          <div className="grid gap-3 mt-4">
            <input type="file" accept=".p12,.pfx" className="input pt-2" onChange={(e) => setP12({ ...p12, f: e.target.files?.[0] })} aria-label="Fichero del certificado" />
            <input type="password" className="input" placeholder="Contraseña del certificado" value={p12.pass} onChange={(e) => setP12({ ...p12, pass: e.target.value })} />
            <div className="flex flex-wrap gap-2">
              <button className="btn-primary" disabled={!p12.f || !p12.pass} onClick={() => accion(async () => store.guardarCertificado(o.id, new Uint8Array(await p12.f!.arrayBuffer()), p12.pass), "Certificado guardado y cifrado")}>Cargar certificado</button>
              {o.entorno === "pruebas" && <button className="btn-ghost" disabled={p12.pass.length < 4} onClick={() => accion(() => store.generarCertificadoPruebas(o.id, p12.pass), "Certificado de pruebas generado")}>Generar de pruebas</button>}
            </div>
          </div>
          {err && <p className="text-sm text-bad mt-2">{err}</p>}
        </Panel>

        <Panel>
          <h2 className="font-semibold mb-3">Series de facturación</h2>
          <ul className="space-y-2 text-sm">{store.series(o.id).map((s) => (
            <li key={s.id} className="flex items-center justify-between rounded-xl bg-glass/[.04] border border-line/10 px-3 py-2"><span className="font-mono">{s.codigo}</span><span className="text-muted text-xs">{s.plantilla} · {s.clase}</span><span className="tabular-nums text-xs">último nº {s.ultimoNumero}</span></li>))}</ul>
          <div className="grid grid-cols-[90px_1fr_auto] gap-2 mt-4">
            <input className="input font-mono" placeholder="Código" value={serie.codigo} onChange={(e) => setSerie({ ...serie, codigo: e.target.value.toUpperCase() })} />
            <input className="input font-mono" value={serie.plantilla} onChange={(e) => setSerie({ ...serie, plantilla: e.target.value })} />
            <button className="btn-ghost" disabled={!serie.codigo} onClick={() => accion(async () => { await store.crearSerie(o.id, { ...serie, reinicioAnual: true }); setSerie({ ...serie, codigo: "" }); }, "Serie creada")}><Plus size={16} /></button>
          </div>
        </Panel>

        <Panel>
          <h2 className="font-semibold mb-3">Preferencias</h2>
          <div className="grid sm:grid-cols-2 gap-3">
            <Campo label="Idioma"><div className="flex gap-2"><Languages size={18} className="text-muted mt-2.5" /><select className="input" value={app.idioma} onChange={(e) => app.setIdioma(e.target.value as "es")}><option value="es">Español</option><option value="en">English</option></select></div></Campo>
            <Campo label="Tema"><div className="flex gap-2">
              <button className={`btn-ghost flex-1 ${app.tema === "oscuro" ? "ring-2 ring-accent" : ""}`} onClick={() => app.setTema("oscuro")}><Moon size={16} />Oscuro</button>
              <button className={`btn-ghost flex-1 ${app.tema === "claro" ? "ring-2 ring-accent" : ""}`} onClick={() => app.setTema("claro")}><Sun size={16} />Claro</button></div></Campo>
          </div>
          <h3 className="font-medium mt-5 mb-2 flex items-center gap-2"><Lock size={16} />Cifrado de datos</h3>
          {app.modo === "servidor" ? <p className="text-sm text-muted">En modo servidor los datos viven en tu servidor; protégelo con HTTPS y copias de seguridad del volumen <span className="font-mono">/data</span>.</p> : app.cifrada ? <p className="text-sm text-ok">Los datos de este dispositivo están cifrados (AES-256-GCM).</p> : (
            <div className="grid sm:grid-cols-[1fr_1fr_auto] gap-2">
              <input type="password" className="input" placeholder="Nueva contraseña" value={cif.a} onChange={(e) => setCif({ ...cif, a: e.target.value })} />
              <input type="password" className="input" placeholder="Repetir" value={cif.b} onChange={(e) => setCif({ ...cif, b: e.target.value })} />
              <button className="btn-ghost" disabled={cif.a.length < 8 || cif.a !== cif.b} onClick={() => accion(() => app.activarCifrado(cif.a), "Base de datos cifrada")}>Cifrar</button>
            </div>)}
          <h3 className="font-medium mt-5 mb-1">Módulos opcionales</h3>
          <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="h-4 w-4 mt-0.5" checked={facturae} onChange={(e) => { setFacturae(e.target.checked); pref.set("facturae", e.target.checked ? "1" : "0"); }} />
            <span>Exportación <b>Facturae 3.2.2</b> (factura electrónica para Administraciones Públicas/FACe y B2B). <span className="text-muted">El XML se genera sin firmar y validado contra el esquema oficial; fírmalo con AutoFirma u otra herramienta antes de presentarlo.</span></span></label>
          <p className="text-xs text-muted mt-4">Número de instalación: <span className="font-mono">{store.sistemaInformatico().NumeroInstalacion}</span> · Versión {store.productor.Version}</p>
        </Panel>

        <Panel>
          <h2 className="font-semibold mb-1">Modalidad del sistema de facturación</h2>
          {o.modo === "verifactu" ? (
            <p className="text-sm text-muted">Funcionando como <b className="text-fg">VERI*FACTU</b>: cada registro se envía a la AEAT ({o.entorno === "pruebas" ? "entorno de PRUEBAS" : "producción"}). La renuncia solo puede hacerse con efectos al final del año natural (art. 17 Orden); se añadirá en una próxima versión.</p>
          ) : (<>
            <p className="text-sm text-muted">Funcionando como <b className="text-fg">No VERI*FACTU</b>: registros firmados y conservados {app.modo === "servidor" ? "en tu servidor" : "en este dispositivo"}, con registro de eventos.</p>
            {(app.modo === "servidor" || verifactuLocalDisponible()) ? (
              <button className="btn-ghost mt-3" disabled={!app.puede("propietario")} onClick={() => { if (confirm("¿Pasar a VERI*FACTU? Se registrará el evento de fin de funcionamiento como No VERI*FACTU y, desde ahora, cada nueva factura se enviará a la AEAT.")) void accion(() => store.activarVerifactu(o.id), "Ahora funcionas como VERI*FACTU"); }}>Pasar a VERI*FACTU</button>
            ) : <p className="text-xs text-muted mt-2">Para VERI*FACTU usa la app de escritorio o un servidor: el navegador no puede usar tu certificado para conectar con la AEAT.</p>}
          </>)}
        </Panel>

        <Actualizaciones />
        {app.modo === "servidor" && <MiCuenta />}
        {app.modo === "servidor" && <GestionUsuarios />}

        <div className="lg:col-span-2" id="plantilla"><EditorPlantilla /></div>

        <Panel className="lg:col-span-2">
          <h2 className="font-semibold mb-2 flex items-center gap-2"><Scale size={18} className="text-accent" />Legal</h2>
          <p className="text-sm text-muted">AstroFact no está «certificado» ni «homologado» por la AEAT —no existe tal cosa—: el productor suscribe una declaración responsable (art. 15 Orden HAC/1177/2024). No sustituye a tu asesor fiscal.</p>
          <div className="flex flex-wrap gap-2 mt-3"><button className="btn-ghost" onClick={() => setDoc("decl")}>Declaración responsable</button><button className="btn-ghost" onClick={() => setDoc("aviso")}>Aviso legal</button></div>
        </Panel>
      </div>
      <Modal abierto={!!doc} onClose={() => setDoc(null)} titulo={doc === "decl" ? "Declaración responsable" : "Aviso legal"} ancho="max-w-3xl">
        <pre className="whitespace-pre-wrap text-sm leading-relaxed font-sans">{doc === "decl" ? declaracion : avisoLegal}</pre>
      </Modal>
    </>
  );
}
