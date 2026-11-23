import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export function Panel({ children, className = "", ...p }: { children: ReactNode; className?: string } & React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`glass p-5 animate-rise ${className}`} {...p}>{children}</div>;
}
export function Titulo({ titulo, sub, acciones }: { titulo: string; sub?: string; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div><h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">{titulo}</h1>{sub && <p className="text-muted text-sm mt-1">{sub}</p>}</div>
      {acciones && <div className="flex flex-wrap gap-2">{acciones}</div>}
    </div>
  );
}
export function Campo({ label, children, ayuda, error }: { label: string; children: ReactNode; ayuda?: string; error?: string }) {
  return <label className="block"><span className="label">{label}</span>{children}{error ? <span className="text-xs text-bad mt-1 block">{error}</span> : ayuda && <span className="text-xs text-muted mt-1 block">{ayuda}</span>}</label>;
}
export function Chip({ tono = "neutro", children }: { tono?: "ok" | "warn" | "bad" | "acc" | "neutro"; children: ReactNode }) {
  const c = { ok: "border-ok/40 bg-ok/10 text-ok", warn: "border-warn/40 bg-warn/10 text-warn", bad: "border-bad/50 bg-bad/10 text-bad", acc: "border-accent/40 bg-accent/10 text-accent", neutro: "border-line/20 bg-glass/5 text-muted" }[tono];
  return <span className={`chip ${c}`}>{children}</span>;
}
export function Modal({ abierto, onClose, titulo, children, ancho = "max-w-lg" }: { abierto: boolean; onClose: () => void; titulo: string; children: ReactNode; ancho?: string }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); if (abierto) window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [abierto, onClose]);
  if (!abierto) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-3 bg-black/50 backdrop-blur-sm" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={titulo}>
      <div className={`glass w-full ${ancho} p-6 animate-rise max-h-[90vh] overflow-auto`} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h2 className="text-lg font-semibold">{titulo}</h2><button className="btn-ghost h-8 w-8 px-0" onClick={onClose} aria-label="Cerrar"><X size={16} /></button></div>
        {children}
      </div>
    </div>
  );
}
export function Vacio({ icono, titulo, texto, accion }: { icono: ReactNode; titulo: string; texto: string; accion?: ReactNode }) {
  return <div className="text-center py-14 px-4"><div className="mx-auto mb-4 h-14 w-14 rounded-2xl glass flex items-center justify-center text-accent">{icono}</div><h3 className="font-semibold">{titulo}</h3><p className="text-muted text-sm mt-1 max-w-sm mx-auto">{texto}</p>{accion && <div className="mt-5">{accion}</div>}</div>;
}
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="2 2 60 60" aria-label="AstroFact" role="img">
      <defs><mask id="af-cut-ui"><rect x="0" y="0" width="64" height="64" fill="#fff" /><circle cx="40" cy="23" r="17.5" fill="#000" /><path d="M26.5 34.5 35 43 54 20" fill="none" stroke="#000" strokeWidth="14" strokeLinecap="round" strokeLinejoin="round" /></mask></defs>
      <circle cx="29" cy="34" r="25" fill="currentColor" mask="url(#af-cut-ui)" />
      <path d="M26.5 34.5 35 43 54 20" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
