#!/usr/bin/env node
// Genera las notas de la versión desde el historial de git (entre la etiqueta anterior y la actual).
// Uso: node scripts/changelog.mjs [vX.Y.Z]  → Markdown por stdout.
import { execSync } from "node:child_process";
const sh = (c) => { try { return execSync(c, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };

const actual = process.argv[2] || sh("git describe --tags --exact-match") || "HEAD";
const anterior = sh(`git describe --tags --abbrev=0 ${actual}^`);
const rango = anterior ? `${anterior}..${actual}` : actual;
const repo = (process.env.GITHUB_REPOSITORY || "AstroSoftwareMoon/AstroFact");
const commits = sh(`git log ${rango} --no-merges --pretty=format:%H%x1f%s%x1f%b%x1e`).split("\x1e").map((c) => c.trim()).filter(Boolean).map((c) => { const [h, s, b] = c.split("\x1f"); return { h, s, b: b ?? "" }; });

const grupos = [
  ["✨ Novedades", /^(feat|fase|añad|nuev)/i], ["🐛 Correcciones", /^(fix|corrig|arregl)/i], ["🔒 Seguridad", /^(sec|segur)/i],
  ["📚 Documentación", /^(docs?|document)/i], ["🧰 Mantenimiento", /^(chore|ci|build|refactor|test|versi[oó]n)/i],
];
const porGrupo = new Map(grupos.map(([t]) => [t, []])); porGrupo.set("🔧 Otros cambios", []);
for (const c of commits) {
  if (/^versi[oó]n \d/i.test(c.s)) continue;
  const g = grupos.find(([, re]) => re.test(c.s.replace(/^\W+/, "")));
  porGrupo.get(g ? g[0] : "🔧 Otros cambios").push(c);
}
let md = `## AstroFact ${actual}\n\n`;
for (const [t, cs] of porGrupo) {
  if (!cs.length) continue;
  md += `### ${t}\n\n`;
  for (const c of cs) {
    md += `- ${c.s} ([${c.h.slice(0, 7)}](https://github.com/${repo}/commit/${c.h}))\n`;
    const puntos = [];
    for (const l of c.b.split("\n")) {
      if (/^\s*- /.test(l)) puntos.push(l.trim());
      else if (puntos.length && l.trim() && !/^(Co-Authored-By|Claude-Session):/i.test(l.trim())) puntos[puntos.length - 1] += " " + l.trim();
      else if (!l.trim()) puntos.push("");
    }
    for (const p of puntos.filter(Boolean).slice(0, 8)) md += `  ${p}\n`;
  }
  md += "\n";
}
if (anterior) md += `**Cambios completos:** https://github.com/${repo}/compare/${anterior}...${actual}\n\n`;
md += `> Verifica las descargas con \`SHA256SUMS.txt\`. AstroFact no está «certificado» ni «homologado» por la AEAT y no sustituye a tu asesor fiscal.\n`;
process.stdout.write(md);
