#!/usr/bin/env node
// Fija la misma versión en todo el monorepo: node scripts/version.mjs 0.4.0
// (package.json de cada paquete, Cargo.toml y tauri.conf.json de la app, y el campo
//  Version del bloque SistemaInformatico por defecto). Después: git tag v0.4.0 && git push --tags
import { readFileSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const v = process.argv[2];
if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(v ?? "")) { console.error("Uso: node scripts/version.mjs X.Y.Z"); process.exit(1); }
const json = (f, fn) => { const o = JSON.parse(readFileSync(f, "utf8")); fn(o); writeFileSync(f, JSON.stringify(o, null, 2) + "\n"); console.log("✓", f); };
const txt = (f, re, rep) => { const s = readFileSync(f, "utf8"); if (!re.test(s)) throw new Error(`Patrón no encontrado en ${f}`); writeFileSync(f, s.replace(re, rep)); console.log("✓", f); };

for (const f of ["package.json", "packages/fiscal-core/package.json", "packages/db/package.json", "packages/pdf/package.json", "apps/client/package.json", "apps/server/package.json"])
  try { json(f, (o) => { o.version = v; }); } catch (e) { if (e.code !== "ENOENT") throw e; }
json("apps/client/src-tauri/tauri.conf.json", (o) => { o.version = v; });
txt("apps/client/src-tauri/Cargo.toml", /^version = ".*"$/m, `version = "${v}"`);
txt("packages/db/src/store.ts", /Version: "[^"]+", TipoUsoPosibleSoloVerifactu/, `Version: "${v}", TipoUsoPosibleSoloVerifactu`);
try { execSync("cargo update -p astrofact --offline", { cwd: "apps/client/src-tauri", stdio: "ignore" }); } catch { /* Cargo.lock se actualizará en la próxima compilación */ }
console.log(`\nVersión ${v}. Siguiente paso:\n  git commit -am "Versión ${v}" && git tag v${v} && git push --follow-tags`);
