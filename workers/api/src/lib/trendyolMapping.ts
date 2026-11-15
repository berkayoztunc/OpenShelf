import { and, eq, inArray } from "drizzle-orm";
import { channelListings, productMappings } from "@openshelf/db";
import type { AppEnv } from "../env";

type Db = AppEnv["Variables"]["db"];

export interface LinkInput {
  variantId: string;
  barcode: string;
  sku?: string | null;
  externalId?: string | null;
  enabled?: boolean;
  /** when set, the listing is stored with this `lastError` (e.g. the "awaiting approval" marker) and its synced stock is reset */
  pending?: string;
}

/** Variants (other than `exceptVariantId`) that already own one of these Trendyol barcodes: barcode -> variantId. */
export async function barcodeOwners(db: Db, barcodes: string[], exceptVariantId?: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!barcodes.length) return out;
  const rows = await db.select({ v: productMappings.variantId, bc: productMappings.externalBarcode }).from(productMappings)
    .where(and(eq(productMappings.provider, "trendyol"), inArray(productMappings.externalBarcode, barcodes)));
  for (const r of rows) if (r.bc && r.v !== exceptVariantId) out.set(r.bc, r.v);
  return out;
}

/** The one place that links a local variant to a Trendyol barcode: mapping row and channel listing are written together (one batch). */
export async function linkVariant(db: Db, i: LinkInput): Promise<void> {
  const enabled = i.enabled ?? true;
  const externalId = i.externalId ?? null;
  const listingSet = i.pending !== undefined ? { enabled, externalId, lastError: i.pending, lastSyncedStock: null } : { enabled, externalId };
  await db.batch([
    db.insert(productMappings).values({ id: crypto.randomUUID(), variantId: i.variantId, provider: "trendyol", externalSku: i.sku ?? null, externalBarcode: i.barcode, externalId })
      .onConflictDoUpdate({ target: [productMappings.provider, productMappings.variantId], set: { externalSku: i.sku ?? null, externalBarcode: i.barcode, externalId } }),
    db.insert(channelListings).values({ variantId: i.variantId, channel: "trendyol", enabled, externalId, ...(i.pending !== undefined ? { lastError: i.pending } : {}) })
      .onConflictDoUpdate({ target: [channelListings.variantId, channelListings.channel], set: listingSet }),
  ]);
}

export async function unlinkVariant(db: Db, variantId: string): Promise<void> {
  await db.batch([
    db.delete(productMappings).where(and(eq(productMappings.provider, "trendyol"), eq(productMappings.variantId, variantId))),
    db.delete(channelListings).where(and(eq(channelListings.channel, "trendyol"), eq(channelListings.variantId, variantId))),
  ]);
}
