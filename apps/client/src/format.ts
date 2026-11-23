const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });
export const euros = (v: string | number) => eur.format(Number(v));
export const fecha = (iso?: string) => (iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("es-ES", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");
export const fechaHora = (iso: string) => new Date(iso).toLocaleString("es-ES", { dateStyle: "short", timeStyle: "medium" });
export const corto = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;
