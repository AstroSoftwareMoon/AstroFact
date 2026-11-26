/** Hojas de cálculo: XLSX (Office Open XML) y CSV para Excel en español, sin dependencias externas. */
import { crearZip, leerZip } from "./zip";
import type { Hoja } from "./tipos";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
const colLetra = (i: number) => { let s = ""; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

/** Libro XLSX con una pestaña por hoja: cabecera en negrita y fija, importes con formato #.##0,00. */
export function aXlsx(hojas: Hoja[]): Uint8Array {
  const nombreHoja = (s: string, i: number) => esc(s.replace(/[\\/?*[\]:]/g, " ").slice(0, 31) || `Hoja${i + 1}`);
  const sheet = (h: Hoja) => {
    const filas = [h.columnas, ...h.filas];
    const rows = filas.map((f, r) => `<row r="${r + 1}">${f.map((v, c) => {
      const ref = `${colLetra(c)}${r + 1}`;
      if (v === null || v === undefined || v === "") return "";
      if (r === 0) return `<c r="${ref}" t="inlineStr" s="1"><is><t>${esc(String(v))}</t></is></c>`;
      if (typeof v === "number") return `<c r="${ref}" s="${Number.isInteger(v) && Math.abs(v) < 1e6 && !/importe|base|cuota|total|retenci|pendiente/i.test(h.columnas[c] ?? "") ? 0 : 2}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    }).join("")}</row>`).join("");
    const cols = h.anchos?.length ? `<cols>${h.anchos.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>` : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData></worksheet>`;
  };
  const f: { nombre: string; contenido: string }[] = [
    { nombre: "[Content_Types].xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${hojas.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>` },
    { nombre: "_rels/.rels", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { nombre: "xl/workbook.xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas.map((h, i) => `<sheet name="${nombreHoja(h.nombre, i)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>` },
    { nombre: "xl/_rels/workbook.xml.rels", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { nombre: "xl/styles.xml", contenido: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>` },
    ...hojas.map((h, i) => ({ nombre: `xl/worksheets/sheet${i + 1}.xml`, contenido: sheet(h) })),
  ];
  return crearZip(f);
}

/** CSV para Excel en español: separador «;», coma decimal y BOM UTF-8. */
export function aCsv(h: Hoja): string {
  const celda = (v: string | number | null) => {
    if (v === null || v === undefined) return "";
    const s = typeof v === "number" ? String(v).replace(".", ",") : v;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [h.columnas, ...h.filas].map((f) => f.map(celda).join(";")).join("\r\n") + "\r\n";
}

/** Lee CSV (detecta «;», «,» o tabulador; comillas RFC 4180). Devuelve filas de texto. */
export function leerCsv(texto: string): string[][] {
  const t = texto.replace(/^﻿/, "");
  const primera = t.split(/\r?\n/, 1)[0] ?? "";
  const sep = [";", "\t", ","].map((s) => [s, primera.split(s).length] as const).sort((a, b) => b[1] - a[1])[0]![0];
  const filas: string[][] = []; let fila: string[] = []; let campo = ""; let q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) { if (c === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else q = false; } else campo += c; continue; }
    if (c === '"') q = true;
    else if (c === sep) { fila.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && t[i + 1] === "\n") i++; fila.push(campo); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  if (campo !== "" || fila.length) { fila.push(campo); filas.push(fila); }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}

/** Lee la primera hoja de un XLSX como filas de texto (cadenas compartidas, en línea y números). */
export async function leerXlsx(bytes: Uint8Array): Promise<string[][]> {
  const z = await leerZip(bytes); const dec = new TextDecoder();
  const txt = (n: string) => { const b = z.get(n); return b ? dec.decode(b) : ""; };
  const unesc = (s: string) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, "&");
  const compartidas = [...txt("xl/sharedStrings.xml").matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => unesc([...m[1]!.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("")));
  const rels = txt("xl/_rels/workbook.xml.rels");
  const primera = /<sheet [^>]*r:id="([^"]+)"/.exec(txt("xl/workbook.xml"))?.[1];
  const destino = primera ? new RegExp(`Id="${primera}"[^>]*Target="([^"]+)"`).exec(rels)?.[1] ?? new RegExp(`Target="([^"]+)"[^>]*Id="${primera}"`).exec(rels)?.[1] : undefined;
  const hoja = txt(destino ? `xl/${destino.replace(/^\/?xl\//, "")}` : "xl/worksheets/sheet1.xml");
  if (!hoja) throw new Error("El XLSX no contiene hojas legibles");
  const filas: string[][] = [];
  for (const r of hoja.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const fila: string[] = [];
    for (const c of r[1]!.matchAll(/<c ([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const at = c[1]!, cuerpo = c[2] ?? "";
      const ref = /r="([A-Z]+)\d+"/.exec(at)?.[1] ?? "";
      const idx = ref.split("").reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      const tipo = /t="([^"]+)"/.exec(at)?.[1];
      let v = "";
      if (tipo === "s") v = compartidas[Number(/<v>([^<]*)<\/v>/.exec(cuerpo)?.[1] ?? -1)] ?? "";
      else if (tipo === "inlineStr") v = unesc([...cuerpo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
      else v = unesc(/<v>([^<]*)<\/v>/.exec(cuerpo)?.[1] ?? "");
      fila[idx >= 0 ? idx : fila.length] = v;
    }
    filas.push(Array.from(fila, (x) => x ?? ""));
  }
  return filas.filter((f) => f.some((x) => x.trim() !== ""));
}
