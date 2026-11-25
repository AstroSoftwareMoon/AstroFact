import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Check, FileKey2, Globe2, HardDrive, Lock, Server, ShieldCheck, Sparkles } from "lucide-react";
import { validateNif } from "@astrofact/fiscal-core";
import { useApp } from "../state/app";
import { Campo, Chip, Logo } from "../ui/kit";
import { ejemploFactura } from "./ejemplo";
import AccesoServidor from "../components/AccesoServidor";
import { verifactuLocalDisponible } from "../platform/transporte";

const PASOS = ["idioma", "uso", "negocio", "serie", "cert", "seguridad", "listo"] as const;

export default function Bienvenida() {
  const app = useApp();
  const nav = useNavigate();
  const { t, idioma, setIdioma } = app;
  const remoto = app.modo === "servidor";
  // En modo servidor ya autenticado, el asistente empieza en «negocio»
  const [paso, setPaso] = useState(remoto && app.usuario ? 2 : 0);
  const [usoServidor, setUsoServidor] = useState(false);
  const vfPosible = remoto || verifactuLocalDisponible();
  useEffect(() => { if (remoto && app.usuario) setPaso((p) => Math.max(p, 2)); }, [remoto, app.usuario]);
  const [modalidad, setModalidad] = useState<"no_verifactu" | "verifactu">("no_verifactu");
  const [neg, setNeg] = useState({ nif: "", nombre: "", linea1: "", cp: "", municipio: "", provincia: "", email: "", territorio: "peninsula" as "peninsula" | "canarias", entorno: "pruebas" as "pruebas" | "produccion" });
  const [serie, setSerie] = useState({ codigo: "A", plantilla: "{serie}-{año}-{num:4}", rect: true, simpl: false });
  const [cert, setCert] = useState<{ modo: "p12" | "pruebas" | "luego"; fichero?: File; pass: string }>({ modo: "pruebas", pass: "" });
  const [cifrar, setCifrar] = useState({ activo: false, pass: "", pass2: "" });
  const [trabajando, setTrabajando] = useState(false);
  const [err, setErr] = useState<string>();
  const nifR = neg.nif ? validateNif(neg.nif) : undefined;
  const sig = () => { setErr(undefined); setPaso((p) => { let n = Math.min(p + 1, PASOS.length - 1); if (remoto && PASOS[n] === "seguridad") n++; return n; }); };
  const atras = () => { setErr(undefined); setPaso((p) => Math.max(p - 1, 0)); };
  const id = PASOS[paso];

  async function finalizar() {
    setTrabajando(true); setErr(undefined);
    try {
      if (!remoto && cifrar.activo) { if (cifrar.pass !== cifrar.pass2) throw new Error("Las contraseñas no coinciden"); await app.activarCifrado(cifrar.pass); }
      const s = app.crearStoreNuevo();
      const o = s.obligado() ?? await s.crearObligado({ nif: neg.nif, nombre: neg.nombre, territorio: neg.territorio, modo: modalidad, entorno: neg.entorno, email: neg.email || undefined,
        direccion: { linea1: neg.linea1 || undefined, cp: neg.cp || undefined, municipio: neg.municipio || undefined, provincia: neg.provincia || undefined, pais: "España" } });
      if (!s.series(o.id).length) {
        await s.crearSerie(o.id, { codigo: serie.codigo, plantilla: serie.plantilla, clase: "ordinaria", reinicioAnual: true });
        if (serie.rect) await s.crearSerie(o.id, { codigo: "R", plantilla: "R-{año}-{num:4}", clase: "rectificativa", reinicioAnual: true });
        if (serie.simpl) await s.crearSerie(o.id, { codigo: "T", plantilla: "T-{año}-{num:5}", clase: "simplificada", reinicioAnual: true });
      }
      if (cert.modo === "pruebas") await s.generarCertificadoPruebas(o.id, cert.pass);
      else if (cert.modo === "p12" && cert.fichero) await s.guardarCertificado(o.id, new Uint8Array(await cert.fichero.arrayBuffer()), cert.pass);
      sig();
    } catch (e) { setErr((e as Error).message); } finally { setTrabajando(false); }
  }

  const negocioOk = nifR?.valid && neg.nombre.trim().length > 1;
  const certOk = cert.modo === "luego" || (cert.pass.length >= 4 && (cert.modo === "pruebas" || !!cert.fichero));

  return (
    <div className="min-h-full flex items-center justify-center p-4 sm:p-8">
      <div className="w-full max-w-2xl">
        <div className="flex items-center gap-3 mb-6 justify-center text-fg"><Logo size={40} /><span className="text-3xl font-semibold tracking-tight">Astro<span className="font-light">Fact</span></span></div>
        <div className="flex gap-1.5 justify-center mb-6" aria-label={`Paso ${paso + 1} de ${PASOS.length}`}>
          {PASOS.map((p, i) => <span key={p} className={`h-1.5 rounded-full transition-all duration-500 ${i <= paso ? "w-8 bg-accent" : "w-4 bg-line/20"}`} />)}
        </div>
        <div className="glass p-6 sm:p-8 animate-rise" key={id}>
          {id === "idioma" && (<>
            <h1 className="text-2xl font-semibold">{t("w.bienvenida")}</h1>
            <p className="text-muted mt-2">{t("w.sub")}</p>
            <div className="mt-6"><span className="label">{t("w.idioma")}</span>
              <div className="grid grid-cols-2 gap-3">
                {(["es", "en"] as const).map((l) => (
                  <button key={l} onClick={() => setIdioma(l)} className={`glass !rounded-2xl p-4 text-left transition ${idioma === l ? "ring-2 ring-accent" : "opacity-80 hover:opacity-100"}`}>
                    <Globe2 size={18} className="text-accent mb-2" /><div className="font-medium">{l === "es" ? "Español" : "English"}</div>
                  </button>))}
              </div>
            </div>
            <p className="text-xs text-muted mt-6">AstroFact no sustituye a tu asesor fiscal ni está «certificado» por la AEAT (no existe tal certificación). Cero telemetría.</p>
          </>)}

          {id === "uso" && (<>
            <h2 className="text-xl font-semibold">{t("w.modoUso")}</h2>
            <div className="grid sm:grid-cols-2 gap-3 mt-5">
              <button onClick={() => setUsoServidor(false)} className={`glass !rounded-2xl p-5 text-left transition ${!usoServidor ? "ring-2 ring-accent" : "opacity-80"}`}><HardDrive className="text-accent mb-3" /><div className="font-medium">{t("w.local")}</div><p className="text-sm text-muted mt-1">{t("w.localD")}</p></button>
              <button onClick={() => setUsoServidor(true)} className={`glass !rounded-2xl p-5 text-left transition ${usoServidor ? "ring-2 ring-accent" : "opacity-80"}`} data-testid="uso-servidor"><Server className="text-accent mb-3" /><div className="font-medium">{t("w.servidor")}</div><p className="text-sm text-muted mt-1">{t("w.servidorD")}</p></button>
            </div>
            {usoServidor && <div className="mt-5"><AccesoServidor /></div>}
          </>)}

          {id === "negocio" && (<>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Building2 size={20} className="text-accent" />{t("w.negocio")}</h2>
            <div className="grid sm:grid-cols-2 gap-4 mt-5">
              <Campo label="NIF" error={nifR && !nifR.valid ? nifR.reason : undefined} ayuda={nifR?.valid ? `✓ ${nifR.kind}` : "DNI, NIE o NIF de entidad"}>
                <input className="input font-mono uppercase" value={neg.nif} onChange={(e) => setNeg({ ...neg, nif: e.target.value })} autoFocus placeholder="12345678Z" />
              </Campo>
              <Campo label="Nombre o razón social"><input className="input" value={neg.nombre} onChange={(e) => setNeg({ ...neg, nombre: e.target.value })} placeholder="Mi Negocio SL" /></Campo>
              <div className="sm:col-span-2"><Campo label="Dirección"><input className="input" value={neg.linea1} onChange={(e) => setNeg({ ...neg, linea1: e.target.value })} placeholder="Calle, número" /></Campo></div>
              <Campo label="Código postal"><input className="input" value={neg.cp} onChange={(e) => setNeg({ ...neg, cp: e.target.value })} inputMode="numeric" /></Campo>
              <Campo label="Municipio"><input className="input" value={neg.municipio} onChange={(e) => setNeg({ ...neg, municipio: e.target.value })} /></Campo>
              <Campo label="Provincia"><input className="input" value={neg.provincia} onChange={(e) => setNeg({ ...neg, provincia: e.target.value })} /></Campo>
              <Campo label="Email (opcional)"><input className="input" type="email" value={neg.email} onChange={(e) => setNeg({ ...neg, email: e.target.value })} /></Campo>
              <Campo label="Territorio (huso horario de los registros)" ayuda="Art. 7.e Orden HAC/1177/2024">
                <select className="input" value={neg.territorio} onChange={(e) => setNeg({ ...neg, territorio: e.target.value as "peninsula" })}><option value="peninsula">Península, Baleares, Ceuta y Melilla</option><option value="canarias">Canarias</option></select>
              </Campo>
            </div>
            <div className="mt-6"><span className="label">{t("w.modalidad")}</span>
              <div className="grid sm:grid-cols-2 gap-3">
                <button onClick={() => setModalidad("no_verifactu")} className={`glass !rounded-2xl p-4 text-left ${modalidad === "no_verifactu" ? "ring-2 ring-accent" : "opacity-80"}`}><div className="font-medium flex items-center gap-2"><ShieldCheck size={16} className="text-accent" />No VERI*FACTU</div><p className="text-xs text-muted mt-1">Registros firmados con tu certificado y guardados {remoto ? "en tu servidor" : "en tu equipo"}, con registro de eventos.</p></button>
                <button disabled={!vfPosible} onClick={() => setModalidad("verifactu")} className={`glass !rounded-2xl p-4 text-left disabled:opacity-40 ${modalidad === "verifactu" ? "ring-2 ring-accent" : "opacity-80"}`} data-testid="modalidad-verifactu"><div className="font-medium flex items-center gap-2">VERI*FACTU</div><p className="text-xs text-muted mt-1">{vfPosible ? "Cada registro se envía automáticamente a la AEAT con tu certificado. La factura lleva la leyenda «Factura verificable en la sede electrónica de la AEAT»." : "Requiere la app de escritorio o un servidor: el navegador no puede usar tu certificado para conectar con la AEAT."}</p></button>
              </div>
            </div>
            <div className="mt-5"><Campo label="Entorno" ayuda={neg.entorno === "pruebas" ? "Recomendado mientras pruebas: el QR apunta al portal de pruebas de la AEAT y las facturas se marcan «PRUEBAS»." : "Solo para facturas reales, con tu certificado cualificado."}>
              <select className="input" value={neg.entorno} onChange={(e) => setNeg({ ...neg, entorno: e.target.value as "pruebas" })}><option value="pruebas">Pruebas (sin validez fiscal)</option><option value="produccion">Producción</option></select>
            </Campo></div>
          </>)}

          {id === "serie" && (<>
            <h2 className="text-xl font-semibold">{t("w.serie")}</h2>
            <p className="text-sm text-muted mt-1">Numeración correlativa, sin saltos (art. 6 RD 1619/2012). Las rectificativas van en una serie propia.</p>
            <div className="grid sm:grid-cols-2 gap-4 mt-5">
              <Campo label="Código de serie"><input className="input font-mono" value={serie.codigo} onChange={(e) => setSerie({ ...serie, codigo: e.target.value.toUpperCase() })} /></Campo>
              <Campo label="Formato" ayuda={`Ejemplo: ${serie.plantilla.replace("{serie}", serie.codigo).replace("{año}", String(new Date().getFullYear())).replace(/\{num(?::(\d+))?\}/, (_m, w) => "1".padStart(Number(w ?? 1), "0"))}`}>
                <input className="input font-mono" value={serie.plantilla} onChange={(e) => setSerie({ ...serie, plantilla: e.target.value })} />
              </Campo>
            </div>
            <label className="flex items-center gap-3 mt-5 text-sm"><input type="checkbox" checked={serie.rect} onChange={(e) => setSerie({ ...serie, rect: e.target.checked })} className="accent-[rgb(var(--accent))] h-4 w-4" />Crear serie <b className="font-mono">R</b> para facturas rectificativas</label>
            <label className="flex items-center gap-3 mt-3 text-sm"><input type="checkbox" checked={serie.simpl} onChange={(e) => setSerie({ ...serie, simpl: e.target.checked })} className="accent-[rgb(var(--accent))] h-4 w-4" />Crear serie <b className="font-mono">T</b> para facturas simplificadas (tickets)</label>
          </>)}

          {id === "cert" && (<>
            <h2 className="text-xl font-semibold flex items-center gap-2"><FileKey2 size={20} className="text-accent" />{t("w.cert")}</h2>
            <p className="text-sm text-muted mt-1">En modo No VERI*FACTU cada registro se firma electrónicamente (XAdES, art. 14 Orden HAC/1177/2024). El certificado se guarda cifrado con su contraseña y nunca sale de tu dispositivo.</p>
            <div className="grid gap-3 mt-5">
              {([["p12", "Mi certificado (.p12 / .pfx)", "Certificado cualificado de persona física o representante de entidad."],
                ["pruebas", "Certificado de PRUEBAS", "Autofirmado, solo para probar AstroFact. Las facturas saldrán marcadas «PRUEBAS»."],
                ["luego", "Configurar más tarde", "No podrás emitir facturas hasta configurarlo."]] as const).map(([m, ti, d]) => (
                <button key={m} disabled={m === "pruebas" && neg.entorno !== "pruebas"} onClick={() => setCert({ ...cert, modo: m })} className={`glass !rounded-2xl p-4 text-left transition disabled:opacity-40 ${cert.modo === m ? "ring-2 ring-accent" : ""}`}>
                  <div className="font-medium">{ti}</div><p className="text-xs text-muted mt-0.5">{d}</p>
                </button>))}
            </div>
            {cert.modo === "p12" && <div className="mt-4"><input type="file" accept=".p12,.pfx" className="input pt-2" data-testid="fichero-cert" onChange={(e) => setCert({ ...cert, fichero: e.target.files?.[0] })} /></div>}
            {cert.modo !== "luego" && <div className="mt-4"><Campo label={cert.modo === "p12" ? "Contraseña del certificado" : "Contraseña para proteger el certificado de pruebas"}><input className="input" type="password" value={cert.pass} onChange={(e) => setCert({ ...cert, pass: e.target.value })} autoComplete="new-password" data-testid="pass-cert" /></Campo></div>}
            {remoto && cert.modo !== "luego" && <p className="text-xs text-muted mt-3">El certificado se guarda cifrado en tu servidor. Su contraseña se conserva cifrada con la clave maestra del servidor para poder {modalidad === "verifactu" ? "enviar a la AEAT" : "firmar"} sin que tengas que introducirla cada vez.</p>}
          </>)}

          {id === "seguridad" && (<>
            <h2 className="text-xl font-semibold flex items-center gap-2"><Lock size={20} className="text-accent" />{t("w.seguridad")}</h2>
            <p className="text-sm text-muted mt-1">Opcional: cifra toda la base de datos (AES-256-GCM). Si olvidas la contraseña <b>no se podrá recuperar</b>: haz copias de seguridad.</p>
            <label className="flex items-center gap-3 mt-5 text-sm"><input type="checkbox" checked={cifrar.activo} onChange={(e) => setCifrar({ ...cifrar, activo: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--accent))]" />Cifrar los datos en este dispositivo</label>
            {cifrar.activo && <div className="grid sm:grid-cols-2 gap-4 mt-4">
              <Campo label="Contraseña (mín. 8)"><input className="input" type="password" value={cifrar.pass} onChange={(e) => setCifrar({ ...cifrar, pass: e.target.value })} autoComplete="new-password" /></Campo>
              <Campo label="Repite la contraseña"><input className="input" type="password" value={cifrar.pass2} onChange={(e) => setCifrar({ ...cifrar, pass2: e.target.value })} autoComplete="new-password" /></Campo>
            </div>}
          </>)}

          {id === "listo" && (<div className="text-center py-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-ok/15 text-ok flex items-center justify-center mb-4 animate-rise"><Check size={30} /></div>
            <h2 className="text-2xl font-semibold">{t("w.listo")}</h2>
            <p className="text-muted mt-2 max-w-md mx-auto">Tu sistema de facturación está configurado. Te proponemos una factura de ejemplo: la revisas y decides si emitirla (una factura emitida ya no se puede borrar).</p>
            <div className="flex flex-wrap gap-3 justify-center mt-6">
              <button className="btn-primary" onClick={async () => { await app.terminarBienvenida(); nav("/facturas/nueva", { state: { borrador: await ejemploFactura(app.store) } }); }}><Sparkles size={16} />Factura de ejemplo</button>
              <button className="btn-ghost" onClick={async () => { await app.terminarBienvenida(); nav("/"); }}>Ir al panel</button>
            </div>
          </div>)}

          {err && <p className="mt-4 text-sm text-bad" role="alert">{err}</p>}
          {id !== "listo" && (
            <div className="flex justify-between mt-8">
              <button className="btn-ghost" onClick={atras} disabled={paso === 0 || (remoto && paso <= 2)}>{t("comun.atras")}</button>
              {id === "seguridad" || (remoto && id === "cert")
                ? <button className="btn-primary" onClick={finalizar} disabled={trabajando || (!remoto && cifrar.activo && cifrar.pass.length < 8) || (id === "cert" && !certOk)}>{trabajando ? "Configurando…" : t("comun.empezar")}</button>
                : <button className="btn-primary" onClick={sig} disabled={(id === "uso" && usoServidor) || (id === "negocio" && !negocioOk) || (id === "cert" && !certOk) || (id === "serie" && !serie.codigo)}>{t("comun.siguiente")}</button>}
            </div>)}
        </div>
      </div>
    </div>
  );
}
