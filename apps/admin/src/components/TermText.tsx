import type { ReactNode } from "react";
import { Term } from "./help/Term";

/**
 * Renders a dictionary sentence that contains glossary terms and inline slots:
 * `[[sku|stock code]]` becomes `<Term id="sku">stock code</Term>`, `{{url}}` is replaced by `slots.url`.
 * Keeps the word order of each language inside one translatable string.
 */
export function TermText({ text, slots }: { text: string; slots?: Record<string, ReactNode> }) {
  const parts = text.split(/(\[\[[a-z0-9]+\|[^\]]+\]\]|\{\{\w+\}\})/g);
  return (
    <>
      {parts.map((p, i) => {
        const term = /^\[\[([a-z0-9]+)\|([^\]]+)\]\]$/.exec(p);
        if (term) return <Term key={i} id={term[1]!}>{term[2]}</Term>;
        const slot = /^\{\{(\w+)\}\}$/.exec(p);
        if (slot) return <span key={i}>{slots?.[slot[1]!]}</span>;
        return p;
      })}
    </>
  );
}
