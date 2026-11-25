/**
 * Transporte VERI*FACTU en modo local: solo en la app de escritorio/móvil (Tauri), cuyo núcleo en Rust
 * abre la conexión HTTPS con el certificado de cliente. Un navegador no puede presentar un certificado
 * de cliente desde JavaScript, así que la PWA local trabaja en No VERI*FACTU o se conecta a un servidor.
 */
import type { Transporte } from "@astrofact/db";
import { aB64 } from "./pdf";

export const enTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const verifactuLocalDisponible = () => enTauri();

export function transporteTauri(): Transporte {
  return {
    async enviar(url, soap, cred) {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<{ status: number; body: string }>("aeat_enviar", { url, soap, p12B64: aB64(cred.p12), password: cred.password });
    },
  };
}
