export interface DriftInput { variantId: string; sku?: string; centralAvailable: number; remoteQuantity: number | null }
export interface DriftItem { variantId: string; sku?: string; central: number; remote: number | null; delta: number }

/** Variants where marketplace stock differs from central available stock (remote null = never synced). */
export function computeStockDrift(rows: DriftInput[], tolerance = 0): DriftItem[] {
  return rows
    .map((r) => ({ variantId: r.variantId, sku: r.sku, central: Math.max(0, r.centralAvailable), remote: r.remoteQuantity,
      delta: (r.remoteQuantity ?? 0) - Math.max(0, r.centralAvailable) }))
    .filter((d) => d.remote === null || Math.abs(d.delta) > tolerance)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}
