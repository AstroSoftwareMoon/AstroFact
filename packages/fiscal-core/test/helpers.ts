import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const NORMATIVA = resolve(__dirname, "../../../docs/normativa");
export const XSD = (f: string) => join(NORMATIVA, "xsd", f);
export const ejemplo = (f: string) => readFileSync(join(NORMATIVA, "ejemplos", f), "utf8");

let hasXmllint: boolean | undefined;
export function xmllintDisponible(): boolean {
  if (hasXmllint === undefined) { try { execFileSync("xmllint", ["--version"], { stdio: "ignore" }); hasXmllint = true; } catch { hasXmllint = false; } }
  return hasXmllint;
}

/** Valida un XML contra un XSD oficial con xmllint. Devuelve "" si es válido o el error. */
export function validarXsd(xml: string, xsd: string): string {
  const dir = mkdtempSync(join(tmpdir(), "astrofact-xsd-"));
  const f = join(dir, "doc.xml");
  writeFileSync(f, xml);
  try { execFileSync("xmllint", ["--noout", "--nonet", "--schema", XSD(xsd), f], { stdio: "pipe" }); return ""; }
  catch (e: any) { return String(e.stderr ?? e.message); }
}
