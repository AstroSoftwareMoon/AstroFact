/**
 * Actualizaciones de la app de escritorio (Tauri updater). Solo contacta con GitHub Releases
 * cuando el usuario lo permite; cada paquete se verifica con la firma minisign antes de instalarse.
 */
import { pref } from "./storage";

export const enTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const VERSION: string = __APP_VERSION__;
/** La compilación de release inyecta la clave pública; sin ella no se ofrecen actualizaciones. */
export const actualizadorDisponible = () => enTauri() && import.meta.env.VITE_ACTUALIZADOR === "1";
export const autoActualizar = () => pref.get("auto-actualizar") !== "0";
export const setAutoActualizar = (v: boolean) => pref.set("auto-actualizar", v ? "1" : "0");

export interface Novedad { version: string; notas?: string; fecha?: string; instalar: (progreso?: (pct: number) => void) => Promise<void>; }

export async function buscarActualizacion(): Promise<Novedad | null> {
  if (!actualizadorDisponible()) return null;
  const { check } = await import("@tauri-apps/plugin-updater");
  const u = await check();
  if (!u) return null;
  return {
    version: u.version, notas: u.body ?? undefined, fecha: u.date ?? undefined,
    instalar: async (progreso) => {
      let total = 0, hecho = 0;
      await u.downloadAndInstall((e) => {
        if (e.event === "Started") total = e.data.contentLength ?? 0;
        else if (e.event === "Progress") { hecho += e.data.chunkLength; if (total) progreso?.(Math.round((hecho / total) * 100)); }
      });
      const { relaunch } = await import("@tauri-apps/plugin-process");
      await relaunch();
    },
  };
}
