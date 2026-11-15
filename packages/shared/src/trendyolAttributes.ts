import { matchAttrValue, norm } from "./trendyolMatch";
import type { AttrChoice, VariantRow } from "./trendyolBody";

// ---------------------------------------------------------------- attribute resolution (server / MCP)

/** One attribute of a Trendyol category with its values (null = values not fetched: optional attributes are not looked at unless asked for). */
export interface AttrDef {
  id: number; name: string; required: boolean; varianter: boolean; slicer: boolean; allowCustom: boolean; allowMulti: boolean;
  values: { id: number; name: string }[] | null;
}
export type ChoiceInput = { ids?: number[]; custom?: string };
export interface UnresolvedAttr {
  attributeId: number; name: string; scope: "shared" | "variant"; variantId?: string; variantLabel?: string;
  allowCustom: boolean; optionCount: number; options: { id: number; name: string }[]; reason: "no_match" | "unknown_value";
}
const OPTION_PREVIEW = 50;

/**
 * Chooses the attribute values of a draft, the same way the wizard does: per variant for variant-defining / slicer attributes or any attribute whose
 * list matches the names of two or more variants; shared ones from an explicit override, last time's choice, Menşei = the origin field, a name match
 * for a one-variant product, or the only possible value of a required attribute. Required ones that stay open are returned with their options.
 * Mutates `rows[].attrs`; returns the shared choices.
 */
export function resolveAttributes(a: {
  defs: AttrDef[]; rows: VariantRow[]; origin: string; sharedHints: string[];
  remembered?: Record<string, AttrChoice>; shared?: Record<string, ChoiceInput>; byVariant?: Record<string, Record<string, ChoiceInput>>;
}): { shared: Record<number, AttrChoice>; perVariant: number[]; unresolved: UnresolvedAttr[] } {
  const rows = a.rows.filter((r) => r.include);
  const many = rows.length > 1;
  const shared: Record<number, AttrChoice> = {}; const perVariant: number[] = []; const unresolved: UnresolvedAttr[] = [];
  const asChoice = (c: ChoiceInput): AttrChoice => ({ ids: [...new Set(c.ids ?? [])], custom: (c.custom ?? "").trim() });
  const empty = (c: AttrChoice) => !c.ids.length && !c.custom;
  const known = (d: AttrDef, c: AttrChoice) => !d.values || !c.ids.length || c.ids.every((id) => d.values!.some((v) => v.id === id));
  const open = (d: AttrDef, scope: "shared" | "variant", reason: UnresolvedAttr["reason"], r?: VariantRow) => unresolved.push({
    attributeId: d.id, name: d.name, scope, ...(r ? { variantId: r.variantId, variantLabel: r.label } : {}), allowCustom: d.allowCustom,
    optionCount: d.values?.length ?? 0, options: (d.values ?? []).slice(0, OPTION_PREVIEW), reason,
  });

  for (const d of a.defs) {
    const values = d.values ?? [];
    const per = many && (d.varianter || d.slicer || new Set(rows.map((r) => matchAttrValue(values, r.hints ?? [r.label])?.id).filter((x) => x != null)).size >= 2);
    if (per) {
      perVariant.push(d.id);
      for (const r of rows) {
        const given = a.byVariant?.[r.variantId]?.[String(d.id)];
        let c: AttrChoice = given ? asChoice(given) : { ids: [], custom: "" };
        if (empty(c)) {
          const hit = matchAttrValue(values, r.hints ?? [r.label]);
          if (hit) c = { ids: [hit.id], custom: "" };
          else if (!values.length && d.allowCustom && d.required) c = { ids: [], custom: r.hints?.[0] ?? r.label };
        }
        if (empty(c)) { if (d.required) open(d, "variant", "no_match", r); continue; }
        if (!known(d, c)) { open(d, "variant", "unknown_value", r); continue; }
        r.attrs[d.id] = c;
      }
      continue;
    }
    const given = a.shared?.[String(d.id)];
    let c: AttrChoice = given ? asChoice(given) : { ids: [], custom: "" };
    if (empty(c) && !(d.varianter || d.slicer)) { const rem = a.remembered?.[String(d.id)]; if (rem) c = asChoice(rem); }
    if (empty(c) && values.length) {
      const hints = norm(d.name) === "mensei" ? [a.origin, a.origin.toUpperCase() === "TR" ? "Türkiye" : ""].filter(Boolean) : d.varianter || a.sharedHints.length ? a.sharedHints : [];
      const hit = hints.length ? matchAttrValue(values, hints) : null;
      const only = d.required && values.length === 1 ? values[0]! : null;
      const pick = hit ?? only;
      if (pick) c = { ids: [pick.id], custom: "" };
    }
    if (empty(c) && !values.length && d.allowCustom && d.required && (d.varianter || d.slicer) && a.sharedHints[0]) c = { ids: [], custom: a.sharedHints[0] };
    if (empty(c)) { if (d.required) open(d, "shared", "no_match"); continue; }
    if (!known(d, c)) { open(d, "shared", "unknown_value"); continue; }
    shared[d.id] = c;
  }
  return { shared, perVariant, unresolved };
}

