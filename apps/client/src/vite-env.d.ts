/// <reference types="vite/client" />
declare module "*.md?raw" { const s: string; export default s; }
declare const __APP_VERSION__: string;
interface ImportMetaEnv {
  readonly VITE_ACTUALIZADOR?: string;
  /** Datos de la persona o entidad productora (art. 15 Orden HAC/1177/2024), fijados por quien distribuye la versión. */
  readonly VITE_PRODUCTOR_NOMBRE?: string; readonly VITE_PRODUCTOR_NIF?: string; readonly VITE_PRODUCTOR_DIRECCION?: string;
  readonly VITE_PRODUCTOR_FECHA?: string; readonly VITE_PRODUCTOR_LUGAR?: string; readonly VITE_PRODUCTOR_CONTACTO?: string;
}
