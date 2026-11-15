/**
 * Matching of Trendyol listings to local variants. Pure: the worker feeds it what it fetched, the admin shows the result.
 * Barcode comes first (Trendyol keys everything by barcode; `productMainId` is NOT reliable, sellers' own data is inconsistent there),
 * then stock code = local SKU. Nothing is ever linked here: the admin confirms each suggestion.
 */
export interface RemoteVariant { barcode: string; stockCode: string; title: string; status: "approved" | "pending" | "rejected"; productMainId?: string; rejectReason?: string }
export interface LocalVariant { variantId: string; sku: string; barcode: string | null; label: string; mappedBarcode: string | null }

export interface Suggestion { variantId: string; label: string; barcode: string; title: string; status: RemoteVariant["status"]; by: "barcode" | "sku" }
export interface MatchReport {
  suggestions: Suggestion[];
  /** Trendyol listings that match no (unmapped) local variant */
  unmatchedRemote: RemoteVariant[];
  /** local variants with nothing on Trendyol and no mapping */
  unmatchedLocal: { variantId: string; label: string; sku: string }[];
  /** mapped variants whose barcode is not found on Trendyol (typo, deleted, or still awaiting approval elsewhere) */
  staleMappings: { variantId: string; label: string; barcode: string }[];
  /** the same Trendyol barcode wanted by several local variants: never suggested, needs a human */
  conflicts: { barcode: string; variantIds: string[] }[];
}

export function suggestMatches(remote: RemoteVariant[], local: LocalVariant[]): MatchReport {
  const byBarcode = new Map(remote.filter((r) => r.barcode).map((r) => [r.barcode, r]));
  const bySku = new Map<string, RemoteVariant[]>();
  for (const r of remote) if (r.stockCode) bySku.set(r.stockCode, [...(bySku.get(r.stockCode) ?? []), r]);
  const mappedBarcodes = new Set(local.map((l) => l.mappedBarcode).filter((b): b is string => !!b));

  const wants = new Map<string, { l: LocalVariant; by: Suggestion["by"] }[]>();
  const unmatchedLocal: MatchReport["unmatchedLocal"] = [];
  for (const l of local.filter((x) => !x.mappedBarcode)) {
    let hit: RemoteVariant | undefined; let by: Suggestion["by"] = "barcode";
    if (l.barcode && byBarcode.has(l.barcode)) hit = byBarcode.get(l.barcode);
    else if (bySku.get(l.sku)?.length === 1) { hit = bySku.get(l.sku)![0]; by = "sku"; }
    else if (l.barcode && bySku.get(l.barcode)?.length === 1) { hit = bySku.get(l.barcode)![0]; by = "sku"; }
    if (!hit || mappedBarcodes.has(hit.barcode)) { unmatchedLocal.push({ variantId: l.variantId, label: l.label, sku: l.sku }); continue; }
    wants.set(hit.barcode, [...(wants.get(hit.barcode) ?? []), { l, by }]);
  }

  const suggestions: Suggestion[] = []; const conflicts: MatchReport["conflicts"] = []; const taken = new Set<string>();
  for (const [barcode, list] of wants) {
    if (list.length > 1) { conflicts.push({ barcode, variantIds: list.map((x) => x.l.variantId) }); continue; }
    const r = byBarcode.get(barcode)!; const { l, by } = list[0]!;
    suggestions.push({ variantId: l.variantId, label: l.label, barcode, title: r.title, status: r.status, by }); taken.add(barcode);
  }
  const conflicted = new Set(conflicts.map((c) => c.barcode));
  return {
    suggestions: suggestions.sort((a, b) => Number(a.by === "sku") - Number(b.by === "sku") || a.label.localeCompare(b.label)),
    unmatchedRemote: remote.filter((r) => r.barcode && !taken.has(r.barcode) && !mappedBarcodes.has(r.barcode) && !conflicted.has(r.barcode)),
    unmatchedLocal,
    staleMappings: local.filter((l) => l.mappedBarcode && !byBarcode.has(l.mappedBarcode)).map((l) => ({ variantId: l.variantId, label: l.label, barcode: l.mappedBarcode! })),
    conflicts,
  };
}

/** Flatten Trendyol's approved (content -> variants) and unapproved (flat, `status: pendingApproval | rejected`) pages into remote variants. */
export function remoteVariants(approved: unknown[], unapproved: unknown[]): RemoteVariant[] {
  const s = (v: unknown) => (v == null ? "" : String(v));
  const out: RemoteVariant[] = [];
  for (const raw of approved) {
    const c = (raw ?? {}) as { title?: unknown; productMainId?: unknown; variants?: unknown };
    for (const v of Array.isArray(c.variants) ? (c.variants as Record<string, unknown>[]) : []) {
      out.push({ barcode: s(v.barcode), stockCode: s(v.stockCode), title: s(c.title), status: "approved", productMainId: s(c.productMainId) });
    }
  }
  for (const raw of unapproved) {
    const p = (raw ?? {}) as Record<string, unknown>;
    const rejected = s(p.status).toLowerCase() === "rejected";
    const reason = (Array.isArray(p.rejectReasonDetails) ? (p.rejectReasonDetails as { rejectReason?: unknown }[]) : [])[0]?.rejectReason;
    out.push({ barcode: s(p.barcode), stockCode: s(p.stockCode), title: s(p.title), status: rejected ? "rejected" : "pending", productMainId: s(p.productMainId), ...(reason ? { rejectReason: s(reason) } : {}) });
  }
  return out;
}
