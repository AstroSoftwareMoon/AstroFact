/**
 * Representación de la factura. QR tributario según art. 20–21 Orden HAC/1177/2024 y la
 * especificación AEAT v0.5.0: arriba, centrado, 35 mm, margen en blanco ≥ 6 mm, texto
 * «QR tributario:» encima (no se traduce), y leyenda VERI*FACTU solo en ese modo.
 * Fase 3 añadirá el PDF y las plantillas personalizables.
 */
import { svgQr, QR_LAYOUT, TIPO_FACTURA, type TipoFactura } from "@astrofact/fiscal-core";
import type { Factura, Obligado } from "@astrofact/db";
import { euros, fecha } from "../format";

export default function DocumentoFactura({ f, o }: { f: Factura; o: Obligado }) {
  const d = f.datos; const t = f.totales; const dest = d.destinatarios?.[0];
  const verifactu = o.modo === "verifactu";
  const dir = (x?: { linea1?: string; cp?: string; municipio?: string; provincia?: string }) => [x?.linea1, [x?.cp, x?.municipio].filter(Boolean).join(" "), x?.provincia].filter(Boolean).join(" · ");
  return (
    <article className="printable relative bg-white text-[#111] rounded-2xl shadow-2xl mx-auto w-full max-w-[210mm] min-h-[297mm] px-[14mm] py-[10mm] text-[12.5px] leading-relaxed" aria-label={`Factura ${f.numSerie}`}>
      {(f.dePruebas || f.anulada) && <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden"><span className="text-[64px] font-black tracking-widest text-black/[.06] -rotate-[28deg] whitespace-nowrap">{f.anulada ? "ANULADA" : "PRUEBAS · SIN VALIDEZ"}</span></div>}
      {/* QR tributario: primer elemento, centrado, con zona en blanco */}
      <div className="flex flex-col items-center" style={{ padding: `${QR_LAYOUT.margenRecomendadoMm}mm 0 ${QR_LAYOUT.margenMinMm}mm` }} data-testid="qr-tributario">
        <div className="font-medium mb-1">{QR_LAYOUT.textoSuperior}</div>
        <div style={{ padding: `${QR_LAYOUT.margenRecomendadoMm}mm`, background: "#fff" }} dangerouslySetInnerHTML={{ __html: svgQr(f.qrUrl, QR_LAYOUT.tamanoDefectoMm) }} />
        {verifactu && <div className="font-medium mt-1 text-center">{QR_LAYOUT.leyendaVerifactu}</div>}
      </div>
      <header className="flex justify-between gap-6 mt-4 border-t border-black/10 pt-5">
        <div>
          <div className="text-lg font-semibold">{d.emisor.nombre}</div>
          <div className="text-black/60">NIF {d.emisor.nif}</div>
          <div className="text-black/60">{dir(o.direccion)}</div>
          {o.email && <div className="text-black/60">{o.email}</div>}
        </div>
        <div className="text-right">
          <div className="text-[11px] uppercase tracking-wider text-black/50">{f.tipoFactura.startsWith("R") ? "Factura rectificativa" : f.tipoFactura === "F2" ? "Factura simplificada" : "Factura"}</div>
          <div className="text-2xl font-semibold tracking-tight">{f.numSerie}</div>
          <div className="text-black/60">Fecha de expedición: {fecha(f.fechaExpedicion)}</div>
          {f.fechaOperacion && <div className="text-black/60">Fecha de operación: {fecha(f.fechaOperacion)}</div>}
        </div>
      </header>
      {dest && (
        <section className="mt-5 rounded-xl bg-black/[.03] px-4 py-3">
          <div className="text-[11px] uppercase tracking-wider text-black/50">Cliente</div>
          <div className="font-medium">{dest.nombre}</div>
          <div className="text-black/60">{dest.nif ? `NIF ${dest.nif}` : dest.idOtro ? `${dest.idOtro.codigoPais ?? ""} ${dest.idOtro.id}` : ""}{dest.direccion ? ` · ${dir(dest.direccion)}` : ""}</div>
        </section>)}
      {d.rectificacion && (
        <section className="mt-3 text-black/70">
          Rectifica a: {d.rectificacion.facturas.map((x) => `${x.NumSerieFactura} (${x.FechaExpedicionFactura})`).join(", ")} · {d.rectificacion.tipo === "S" ? "por sustitución" : "por diferencias"} · {TIPO_FACTURA[f.tipoFactura as TipoFactura]}
        </section>)}
      <p className="mt-4"><span className="text-black/50">Concepto:</span> {d.descripcionOperacion}</p>
      <table className="w-full mt-4">
        <thead><tr className="text-left text-[11px] uppercase tracking-wider text-black/50 border-b border-black/15"><th className="py-2 font-medium">Descripción</th><th className="py-2 font-medium text-right">Cant.</th><th className="py-2 font-medium text-right">Precio</th><th className="py-2 font-medium text-right">Dto.</th><th className="py-2 font-medium text-right">Impuesto</th><th className="py-2 font-medium text-right">Base</th></tr></thead>
        <tbody>{d.lineas.map((l, i) => (
          <tr key={i} className="border-b border-black/5"><td className="py-2 pr-2">{l.descripcion}</td><td className="py-2 text-right tabular-nums">{l.cantidad}</td><td className="py-2 text-right tabular-nums">{euros(l.precioUnitario)}</td>
            <td className="py-2 text-right">{l.descuentoPct ? `${l.descuentoPct}%` : ""}</td>
            <td className="py-2 text-right">{l.exenta ? `Exenta (${l.exenta})` : l.calificacion === "S2" ? "ISP" : l.calificacion?.startsWith("N") ? "No sujeta" : `${l.impuesto === "03" ? "IGIC" : l.impuesto === "02" ? "IPSI" : "IVA"} ${l.tipo}%${l.recargo ? ` + RE ${l.recargo}%` : ""}`}</td>
            <td className="py-2 text-right tabular-nums">{euros(t.lineas[i]?.base ?? 0)}</td></tr>))}</tbody>
      </table>
      <div className="flex justify-end mt-5">
        <table className="min-w-[300px] tabular-nums">
          <tbody>
            {t.desglose.map((g, i) => (<tr key={i} className="text-black/70"><td className="py-0.5 pr-6">Base {g.exenta ? `exenta ${g.exenta}` : g.calificacion === "S2" ? "ISP" : g.calificacion?.startsWith("N") ? "no sujeta" : `${g.tipo}%`}</td><td className="text-right">{euros(g.base)}</td></tr>))}
            {t.desglose.filter((g) => Number(g.cuota) !== 0).map((g, i) => <tr key={`c${i}`} className="text-black/70"><td className="py-0.5 pr-6">{g.impuesto === "03" ? "IGIC" : g.impuesto === "02" ? "IPSI" : "IVA"} {g.tipo}%</td><td className="text-right">{euros(g.cuota)}</td></tr>)}
            {t.desglose.filter((g) => Number(g.cuotaRecargo) !== 0).map((g, i) => <tr key={`r${i}`} className="text-black/70"><td className="py-0.5 pr-6">Recargo de equivalencia {g.recargo}%</td><td className="text-right">{euros(g.cuotaRecargo)}</td></tr>)}
            <tr className="border-t border-black/20 font-semibold text-[14px]"><td className="pt-2 pr-6">Importe total factura</td><td className="pt-2 text-right">{euros(t.importeTotal)}</td></tr>
            {Number(t.retencion) !== 0 && <tr className="text-black/70"><td className="py-0.5 pr-6">Retención IRPF {d.retencionPct}%</td><td className="text-right">−{euros(t.retencion)}</td></tr>}
            {Number(t.retencion) !== 0 && <tr className="font-semibold text-[15px]"><td className="pt-1 pr-6">Total a pagar</td><td className="pt-1 text-right">{euros(t.totalAPagar)}</td></tr>}
          </tbody>
        </table>
      </div>
      {d.lineas.some((l) => l.calificacion === "S2") && <p className="mt-5 text-black/70">Operación con inversión del sujeto pasivo (art. 84.Uno.2º Ley 37/1992).</p>}
      {d.lineas.some((l) => l.exenta) && <p className="mt-2 text-black/70">Operación exenta de IVA según la normativa aplicable ({[...new Set(d.lineas.filter((l) => l.exenta).map((l) => l.exenta))].join(", ")}).</p>}
      <footer className="absolute bottom-[10mm] left-[14mm] right-[14mm] text-[10.5px] text-black/50 border-t border-black/10 pt-2 flex justify-between gap-4">
        <span>{o.pieLegal ?? ""}{o.iban ? ` IBAN ${o.iban}` : ""}</span><span className="whitespace-nowrap">Página 1</span>
      </footer>
    </article>
  );
}
