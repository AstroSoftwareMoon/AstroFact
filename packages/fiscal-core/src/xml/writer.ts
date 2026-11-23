/** Generador XML mínimo, determinista y con escapado correcto (UTF-8). */
export type XmlChild = XmlNode | string | null | undefined | false;
export interface XmlNode { name: string; attrs?: Record<string, string>; children: XmlChild[]; }

export function el(name: string, ...children: XmlChild[]): XmlNode;
export function el(name: string, attrs: Record<string, string>, ...children: XmlChild[]): XmlNode;
export function el(name: string, a?: Record<string, string> | XmlChild, ...rest: XmlChild[]): XmlNode {
  if (a && typeof a === "object" && !("name" in a && "children" in a)) return { name, attrs: a as Record<string, string>, children: rest };
  return { name, children: [a as XmlChild, ...rest] };
}

/** Elemento opcional: solo se genera si `value` no es vacío. */
export function opt(name: string, value: string | undefined | null): XmlNode | null {
  return value === undefined || value === null || value === "" ? null : { name, children: [value] };
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function serialize(node: XmlNode, indent = "  ", level = 0): string {
  const pad = indent ? indent.repeat(level) : "";
  const nl = indent ? "\n" : "";
  const attrs = node.attrs ? Object.entries(node.attrs).map(([k, v]) => ` ${k}="${escapeXml(v)}"`).join("") : "";
  const kids = node.children.filter((c): c is XmlNode | string => c !== null && c !== undefined && c !== false);
  if (kids.length === 0) return `${pad}<${node.name}${attrs}/>`;
  if (kids.every((k) => typeof k === "string")) return `${pad}<${node.name}${attrs}>${escapeXml((kids as string[]).join(""))}</${node.name}>`;
  const inner = kids.map((k) => (typeof k === "string" ? pad + indent + escapeXml(k) : serialize(k, indent, level + 1))).join(nl);
  return `${pad}<${node.name}${attrs}>${nl}${inner}${nl}${pad}</${node.name}>`;
}

export const XML_DECL = '<?xml version="1.0" encoding="UTF-8"?>';
export const toXmlDocument = (node: XmlNode, indent = "  ") => `${XML_DECL}\n${serialize(node, indent)}\n`;
