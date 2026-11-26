import { Fragment, type ReactNode } from "react";

/** Markdown mínimo y seguro (sin HTML): títulos, párrafos, listas, citas, negrita, cursiva, código y enlaces https. */
function enLinea(t: string): ReactNode[] {
  const out: ReactNode[] = []; const re = /(\*\*[^*]+\*\*|_[^_]+_|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let i = 0, m: RegExpExecArray | null, k = 0;
  while ((m = re.exec(t))) {
    if (m.index > i) out.push(t.slice(i, m.index));
    const s = m[0];
    if (s.startsWith("**")) out.push(<b key={k++} className="text-fg">{s.slice(2, -2)}</b>);
    else if (s.startsWith("_")) out.push(<em key={k++}>{s.slice(1, -1)}</em>);
    else if (s.startsWith("`")) out.push(<code key={k++} className="font-mono text-[.9em] bg-glass/[.08] rounded px-1">{s.slice(1, -1)}</code>);
    else { const [, txt, url] = /\[([^\]]+)\]\(([^)]+)\)/.exec(s)!; out.push(/^https:\/\//.test(url!) ? <a key={k++} href={url} target="_blank" rel="noreferrer" className="text-accent underline">{txt}</a> : <span key={k++}>{txt}</span>); }
    i = m.index + s.length;
  }
  if (i < t.length) out.push(t.slice(i));
  return out;
}

export default function Markdown({ texto }: { texto: string }) {
  const bloques: ReactNode[] = []; const lineas = texto.split(/\r?\n/); let k = 0;
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i]!;
    if (!l.trim()) continue;
    if (/^---+$/.test(l.trim())) { bloques.push(<hr key={k++} className="my-5 border-line/15" />); continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(l);
    if (h) { const n = h[1]!.length; bloques.push(<div key={k++} role="heading" aria-level={n} className={`${n === 1 ? "text-xl" : n === 2 ? "text-lg" : "text-base"} font-semibold mt-5 mb-2`}>{enLinea(h[2]!)}</div>); continue; }
    if (l.startsWith(">")) { const g: string[] = []; while (i < lineas.length && lineas[i]!.startsWith(">")) g.push(lineas[i++]!.replace(/^>\s?/, "")); i--;
      bloques.push(<blockquote key={k++} className="border-l-2 border-warn/60 bg-warn/10 rounded-r-xl px-4 py-2 my-3 text-sm">{enLinea(g.join(" "))}</blockquote>); continue; }
    if (/^\s*[-*]\s/.test(l)) { const g: string[] = []; while (i < lineas.length && /^\s*[-*]\s/.test(lineas[i]!)) g.push(lineas[i++]!.replace(/^\s*[-*]\s/, "")); i--;
      bloques.push(<ul key={k++} className="list-disc pl-5 my-2 space-y-1 text-sm">{g.map((x, j) => <li key={j}>{enLinea(x)}</li>)}</ul>); continue; }
    const g: string[] = [l]; while (i + 1 < lineas.length && lineas[i + 1]!.trim() && !/^(#|>|---|\s*[-*]\s)/.test(lineas[i + 1]!)) g.push(lineas[++i]!);
    bloques.push(<p key={k++} className="text-sm leading-relaxed my-2.5">{enLinea(g.join(" ")).map((x, j) => <Fragment key={j}>{x}</Fragment>)}</p>);
  }
  return <div className="text-muted [&_b]:font-semibold">{bloques}</div>;
}
