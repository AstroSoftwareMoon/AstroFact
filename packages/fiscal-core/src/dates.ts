/**
 * Fechas en los formatos de los registros de facturación:
 *  - fecha (DD-MM-AAAA) — tipo "fecha" del XSD SuministroInformacion.
 *  - FechaHoraHusoGenRegistro: xs:dateTime ISO 8601 con huso, p. ej. 2024-01-01T19:20:30+01:00
 *    (art. 7.e y 7.g Orden HAC/1177/2024: fecha y hora del territorio desde donde se expide).
 */
export type Territorio = "peninsula" | "canarias";
export const TIMEZONES: Record<Territorio, string> = { peninsula: "Europe/Madrid", canarias: "Atlantic/Canary" };

const pad = (n: number, l = 2) => String(n).padStart(l, "0");

function partsInZone(date: Date, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-GB", {
    timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  const o: Record<string, number> = {};
  for (const p of f.formatToParts(date)) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Desfase (minutos) de la zona respecto a UTC en un instante dado. */
export function zoneOffsetMinutes(date: Date, timeZone: string): number {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
}

/** ISO 8601 con huso horario, segundos enteros: 2024-01-01T19:20:30+01:00 */
export function toIsoWithOffset(date: Date, timeZone = TIMEZONES.peninsula): string {
  const p = partsInZone(date, timeZone);
  const off = zoneOffsetMinutes(date, timeZone);
  const sign = off >= 0 ? "+" : "-";
  const a = Math.abs(off);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Interpreta un xs:dateTime con huso a Date. */
export function parseIsoWithOffset(s: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(s)) throw new RangeError(`FechaHoraHuso no válida: ${s}`);
  return new Date(s);
}

/** Fecha DD-MM-AAAA de un Date en la zona indicada. */
export function toFechaAeat(date: Date, timeZone = TIMEZONES.peninsula): string {
  const p = partsInZone(date, timeZone);
  return `${pad(p.day)}-${pad(p.month)}-${p.year}`;
}

/** Convierte YYYY-MM-DD (ISO de calendario) a DD-MM-AAAA. */
export function isoDateToAeat(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new RangeError(`Fecha ISO no válida: ${iso}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}
export function aeatDateToIso(f: string): string {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(f);
  if (!m) throw new RangeError(`Fecha AEAT no válida: ${f}`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}
/** Compara fechas de calendario (YYYY-MM-DD o DD-MM-AAAA). */
export function compareCalendarDates(a: string, b: string): number {
  const n = (s: string) => (/^\d{2}-/.test(s) ? aeatDateToIso(s) : s);
  return n(a) < n(b) ? -1 : n(a) > n(b) ? 1 : 0;
}
