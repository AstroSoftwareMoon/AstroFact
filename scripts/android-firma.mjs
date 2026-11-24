#!/usr/bin/env node
// Añade la configuración de firma "release" (keystore.properties) al build.gradle.kts generado por `tauri android init`.
import { readFileSync, writeFileSync } from "node:fs";
const f = process.argv[2];
let s = readFileSync(f, "utf8");
if (s.includes("signingConfigs")) { console.log("Firma ya configurada"); process.exit(0); }
if (!s.includes("import java.io.FileInputStream")) s = `import java.io.FileInputStream\n` + s;
s = s.replace(/android\s*\{/, `android {
    signingConfigs {
        create("release") {
            val props = java.util.Properties()
            val f = rootProject.file("keystore.properties")
            if (f.exists()) {
                props.load(FileInputStream(f))
                storeFile = file(props["storeFile"] as String)
                storePassword = props["storePassword"] as String
                keyAlias = props["keyAlias"] as String
                keyPassword = props["keyPassword"] as String
            }
        }
    }`);
s = s.replace(/getByName\("release"\)\s*\{/, `getByName("release") {\n            signingConfig = signingConfigs.getByName("release")`);
writeFileSync(f, s);
console.log("✓ Firma release configurada en", f);
