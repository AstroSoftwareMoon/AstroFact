/** Importación de clientes y productos desde CSV/XLSX con detección de columnas por nombre (sinónimos). */
import { D, normalizeNif, validateEuVat, validateNif } from "@astrofact/fiscal-core";

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9%]+/g, " ").trim();
const SIN_CLIENTE: Record<string, string[]> = {
  nombre: ["nombre", "razon social", "nombre o razon social", "cliente", "empresa", "denominacion", "nombre fiscal"],
  nif: ["nif", "cif", "dni", "nie", "nif cif", "cif nif", "vat", "nif iva", "identificacion fiscal", "documento"],
  email: ["email", "e mail", "correo", "correo electronico", "mail"],
  telefono: ["telefono", "tel", "movil", "telefono movil", "phone"],
  linea1: ["direccion", "domicilio", "calle", "direccion fiscal", "address"],
  cp: ["cp", "codigo postal", "c p", "postal"],
  municipio: ["municipio", "poblacion", "ciudad", "localidad", "city"],
  provincia: ["provincia", "region"],
  pais: ["pais", "country"],
  formaPago: ["forma de pago", "forma pago", "pago"],
  recargoEquivalencia: ["recargo de equivalencia", "recargo equivalencia", "re"],
  retencionPct: ["retencion", "% retencion", "irpf", "retencion irpf"],
  notas: ["notas", "observaciones", "comentarios"],
};
const SIN_PRODUCTO: Record<string, string[]> = {
  nombre: ["nombre", "producto", "servicio", "concepto", "descripcion", "articulo", "item"],
  codigo: ["codigo", "ref", "referencia", "sku", "cod"],
  precio: ["precio", "pvp", "precio unitario", "importe", "precio sin iva", "base", "price"],
  tipo: ["iva", "% iva", "tipo iva", "tipo", "iva %", "vat"],
  unidad: ["unidad", "ud", "unidades"],
  descripcion: ["descripcion larga", "detalle", "notas"],
};

function mapear(cab: string[], sin: Record<string, string[]>) {
  const m: Record<string, number> = {};
  const n = cab.map(norm);
  for (const [campo, alias] of Object.entries(sin)) {
    const i = n.findIndex((c) => alias.includes(c));
    if (i >= 0 && !Object.values(m).includes(i)) m[campo] = i;
  }
  return m;
}
const si = (s: string) => /^(s|si|sí|x|1|true|yes)$/i.test(s.trim());
const numero = (s: string) => { const t = s.replace(/[€\s]/g, ""); const x = /,\d{1,6}$/.test(t) ? t.replace(/\./g, "").replace(",", ".") : t.replace(/,/g, ""); return D(x).toPlain(); };

export interface ResultadoImportacion<T> { mapeo: Record<string, string>; validos: T[]; errores: { fila: number; mensaje: string }[]; }

export interface ClienteImportado {
  nombre: string; nif?: string; idOtro?: { codigoPais?: string; idType: "02"; id: string }; email?: string; telefono?: string;
  direccion?: { linea1?: string; cp?: string; municipio?: string; provincia?: string; pais?: string }; formaPago?: string; recargoEquivalencia?: boolean; retencionPct?: string; notas?: string;
}
export function importarClientes(filas: string[][]): ResultadoImportacion<ClienteImportado> {
  const [cab, ...datos] = filas;
  if (!cab) throw new Error("El fichero está vacío");
  const m = mapear(cab, SIN_CLIENTE);
  if (m.nombre === undefined) throw new Error("No se encuentra la columna del nombre (p. ej. «Nombre» o «Razón social»)");
  const out: ClienteImportado[] = [], errores: { fila: number; mensaje: string }[] = [], vistos = new Set<string>();
  datos.forEach((f, i) => {
    const g = (k: string) => (m[k] !== undefined ? (f[m[k]!] ?? "").trim() : "");
    const fila = i + 2;
    const nombre = g("nombre");
    if (!nombre) { errores.push({ fila, mensaje: "Falta el nombre" }); return; }
    const c: ClienteImportado = { nombre, email: g("email") || undefined, telefono: g("telefono") || undefined, formaPago: g("formaPago") || undefined, notas: g("notas") || undefined };
    const raw = g("nif");
    if (raw) {
      const n = normalizeNif(raw);
      if (validateNif(n).valid) c.nif = n;
      else if (validateEuVat(n)) c.idOtro = { codigoPais: n.slice(0, 2) === "EL" ? "GR" : n.slice(0, 2), idType: "02", id: n };
      else { errores.push({ fila, mensaje: `NIF no válido: ${raw}` }); return; }
      const k = c.nif ?? c.idOtro!.id;
      if (vistos.has(k)) { errores.push({ fila, mensaje: `NIF repetido en el fichero: ${k}` }); return; }
      vistos.add(k);
    }
    const dir = { linea1: g("linea1") || undefined, cp: g("cp") || undefined, municipio: g("municipio") || undefined, provincia: g("provincia") || undefined, pais: g("pais") || undefined };
    if (Object.values(dir).some(Boolean)) c.direccion = dir;
    if (g("recargoEquivalencia")) c.recargoEquivalencia = si(g("recargoEquivalencia"));
    if (g("retencionPct")) { try { c.retencionPct = numero(g("retencionPct").replace("%", "")); } catch { errores.push({ fila, mensaje: "Retención no numérica" }); return; } }
    out.push(c);
  });
  return { mapeo: Object.fromEntries(Object.entries(m).map(([k, i]) => [k, cab[i]!])), validos: out, errores };
}

export interface ProductoImportado { nombre: string; codigo?: string; precio: string; tipo?: string; unidad?: string; descripcion?: string; }
export function importarProductos(filas: string[][]): ResultadoImportacion<ProductoImportado> {
  const [cab, ...datos] = filas;
  if (!cab) throw new Error("El fichero está vacío");
  const m = mapear(cab, SIN_PRODUCTO);
  if (m.nombre === undefined || m.precio === undefined) throw new Error("Se necesitan al menos las columnas «Nombre» y «Precio»");
  const out: ProductoImportado[] = [], errores: { fila: number; mensaje: string }[] = [];
  datos.forEach((f, i) => {
    const g = (k: string) => (m[k] !== undefined ? (f[m[k]!] ?? "").trim() : "");
    const fila = i + 2;
    if (!g("nombre")) { errores.push({ fila, mensaje: "Falta el nombre" }); return; }
    let precio: string; try { precio = numero(g("precio")); } catch { errores.push({ fila, mensaje: `Precio no válido: ${g("precio")}` }); return; }
    let tipo: string | undefined;
    if (g("tipo")) { try { tipo = numero(g("tipo").replace("%", "")); } catch { errores.push({ fila, mensaje: `IVA no válido: ${g("tipo")}` }); return; }
      if (!["0", "2", "4", "5", "7.5", "10", "21"].includes(tipo)) { errores.push({ fila, mensaje: `Tipo de IVA no admitido: ${tipo} %` }); return; } }
    out.push({ nombre: g("nombre"), codigo: g("codigo") || undefined, precio, tipo: tipo ?? "21", unidad: g("unidad") || undefined, descripcion: g("descripcion") || undefined });
  });
  return { mapeo: Object.fromEntries(Object.entries(m).map(([k, i]) => [k, cab[i]!])), validos: out, errores };
}
