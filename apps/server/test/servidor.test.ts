import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crearServidor } from "../src/app";

describe("Servidor", () => {
  it("salud, PWA, fallback SPA y cabeceras de seguridad", async () => {
    const web = mkdtempSync(join(tmpdir(), "afweb-"));
    writeFileSync(join(web, "index.html"), "<!doctype html><title>AstroFact</title>");
    const app = await crearServidor({ webDir: web, version: "9.9.9" });
    const s = await app.inject("/api/salud");
    expect(s.json()).toEqual({ estado: "ok", version: "9.9.9", fase: 4 });
    expect(s.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(s.headers["x-content-type-options"]).toBe("nosniff");
    const r = await app.inject("/facturas/123");
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain("AstroFact");
    expect((await app.inject("/api/nada")).statusCode).toBe(404);
    writeFileSync(join(web, "sw.js"), "//"); 
    expect((await app.inject("/sw.js")).headers["cache-control"]).toBe("no-cache");
    await app.close();
  });
});
