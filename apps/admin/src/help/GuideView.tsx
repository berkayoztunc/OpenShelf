import { Children, isValidElement, type ReactNode } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { Link, useInRouterContext } from "react-router-dom";
import { AlertTriangle, Info, Lightbulb, OctagonAlert, Link2 } from "lucide-react";
import { Term } from "../components/help/Term";
import { slugify } from "./slug";
import { ANCHOR_SUFFIX } from "./content";

const CALLOUTS = {
  NOTE: { icon: Info, cls: "border-info-line bg-info-soft text-info" },
  TIP: { icon: Lightbulb, cls: "border-success-line bg-success-soft text-success" },
  WARNING: { icon: AlertTriangle, cls: "border-warn-line bg-warn-soft text-warn" },
  DANGER: { icon: OctagonAlert, cls: "border-danger-line bg-danger-soft text-danger" },
} as const;
type CalloutKind = keyof typeof CALLOUTS;

const textOf = (n: ReactNode): string => Children.toArray(n).map((c) => typeof c === "string" ? c : isValidElement(c) ? textOf((c.props as { children?: ReactNode }).children) : "").join("");
/** Remove the leading `[!KIND]` marker from the first text node of a callout. */
function stripMarker(children: ReactNode): ReactNode {
  let done = false;
  const walk = (n: ReactNode): ReactNode => Children.map(n, (c) => {
    if (done) return c;
    if (typeof c === "string") { const s = c.replace(/^\s*\[!(NOTE|TIP|WARNING|DANGER)\]\s*/i, ""); if (s !== c) done = true; return s; }
    if (isValidElement(c)) { const p = c.props as { children?: ReactNode }; return { ...c, props: { ...p, children: walk(p.children) } } as ReactNode; }
    return c;
  });
  return walk(children);
}

function Anchor({ href = "", children }: { href?: string; children?: ReactNode }) {
  const inRouter = useInRouterContext();
  if (href.startsWith("term:")) return <Term id={href.slice(5)}>{children}</Term>;
  if (href.startsWith("#")) return <a href={href} className="font-medium text-brand-ink underline-offset-2 hover:underline" onClick={(e) => { e.preventDefault(); document.getElementById(href.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" }); history.replaceState(null, "", href); }}>{children}</a>;
  if (href.startsWith("/") && inRouter) return <Link to={href} className="font-medium text-brand-ink underline-offset-2 hover:underline">{children}</Link>;
  return <a href={href} target={/^https?:/.test(href) ? "_blank" : undefined} rel="noopener noreferrer" className="font-medium text-brand-ink underline-offset-2 hover:underline">{children}</a>;
}

/** Split an explicit `{#anchor}` suffix off the last text child of a heading. */
function splitAnchor(children: ReactNode): { nodes: ReactNode; id?: string } {
  const arr = Children.toArray(children);
  const last = arr[arr.length - 1];
  if (typeof last === "string") {
    const m = ANCHOR_SUFFIX.exec(last);
    if (m) return { nodes: [...arr.slice(0, -1), last.slice(0, m.index)], id: m[1] };
  }
  return { nodes: children };
}
function heading(level: 1 | 2 | 3 | 4) {
  const cls = { 1: "mb-4 font-display text-3xl font-semibold tracking-tight", 2: "group mb-3 mt-10 scroll-mt-20 border-b border-line pb-2 font-display text-xl font-semibold", 3: "group mb-2 mt-7 scroll-mt-20 text-base font-semibold", 4: "mb-1.5 mt-5 text-sm font-semibold" }[level];
  return function H({ children }: { children?: ReactNode }) {
    const Tag = `h${level}` as "h1";
    const { nodes, id: explicit } = splitAnchor(children);
    const id = level > 1 && level < 4 ? (explicit ?? slugify(textOf(nodes))) : undefined;
    return <Tag id={id} className={cls}>{nodes}{id && <a href={`#${id}`} aria-label="#" className="ml-2 inline-block align-middle text-faint opacity-0 transition group-hover:opacity-100 focus:opacity-100"><Link2 size={14} /></a>}</Tag>;
  };
}

const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
const components: Components = {
  h1: heading(1), h2: heading(2), h3: heading(3), h4: heading(4),
  p: ({ children }) => <p className="my-3 leading-7">{children}</p>,
  ul: ({ children }) => <ul className="my-3 list-disc space-y-1.5 pl-6 marker:text-faint">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 list-decimal space-y-1.5 pl-6 marker:font-semibold marker:text-muted">{children}</ol>,
  li: ({ children }) => <li className="leading-7">{children}</li>,
  a: Anchor as Components["a"],
  strong: ({ children }) => <strong className="font-semibold text-ink">{children}</strong>,
  code: ({ children, className }) => className ? <code className={className}>{children}</code> : <code className="rounded bg-hover px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>,
  pre: ({ children }) => <pre className="my-4 overflow-x-auto rounded-xl border border-line bg-raised p-4 font-mono text-[12.5px] leading-6">{children}</pre>,
  hr: () => <hr className="my-8 border-line" />,
  table: ({ children }) => <div className="my-4 overflow-x-auto rounded-xl border border-line"><table className="w-full border-collapse text-left text-sm">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-hover text-xs uppercase tracking-wide text-muted">{children}</thead>,
  th: ({ children }) => <th className="px-3 py-2 font-semibold">{children}</th>,
  td: ({ children }) => <td className="border-t border-line px-3 py-2 align-top">{children}</td>,
  img: ({ src = "", alt }) => (
    <a href={/^https?:|^\//.test(src) ? src : `${baseUrl}/${src}`} target="_blank" rel="noopener noreferrer" className="my-5 block">
      <img src={/^https?:|^\//.test(src) ? src : `${baseUrl}/${src}`} alt={alt ?? ""} loading="lazy" className="w-full rounded-xl border border-line shadow-soft" />
      {alt && <span className="mt-1.5 block text-center text-xs text-muted">{alt}</span>}
    </a>
  ),
  blockquote: ({ children }) => {
    const m = /^\s*\[!(NOTE|TIP|WARNING|DANGER)\]/i.exec(textOf(children));
    if (!m) return <blockquote className="my-4 border-l-4 border-line-strong pl-4 text-muted">{children}</blockquote>;
    const kind = m[1]!.toUpperCase() as CalloutKind; const { icon: Icon, cls } = CALLOUTS[kind];
    return <div role="note" className={`my-4 flex gap-3 rounded-xl border px-4 py-3 text-sm leading-6 ${cls}`}><Icon size={18} className="mt-0.5 shrink-0" aria-hidden /><div className="min-w-0 text-ink [&>p]:my-1">{stripMarker(children)}</div></div>;
  },
};

/** Renders a guide Markdown document (GFM, no raw HTML) with callouts, glossary terms and anchored headings. */
export function GuideView({ md, className }: { md: string; className?: string }) {
  return <div className={className ?? "text-[15px] text-ink"}><ReactMarkdown remarkPlugins={[remarkGfm]} components={components} urlTransform={(url) => (/^term:[a-z0-9_-]+$/i.test(url) ? url : defaultUrlTransform(url))}>{md}</ReactMarkdown></div>;
}
