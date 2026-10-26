import { TRENDYOL_HOSTS, type TrendyolEnv } from "@openshelf/shared";

/**
 * Trendyol URL shapes, verified against the official docs (developers.trendyol.com/v2.0, checked 2026-10):
 *  - docs/3-prod-stage-environments-1: production host apigw.trendyol.com, stage host stageapigw.trendyol.com
 *    (stage needs Trendyol-side IP whitelisting: 503 = not whitelisted; stage credentials differ from production).
 *  - every operation lives under `/integration/...` (OpenAPI `servers`: https://apigw.trendyol.com/integration).
 */
export type { TrendyolEnv };
export const ALLOWED_HOSTS: readonly string[] = Object.values(TRENDYOL_HOSTS).map((h) => new URL(h).hostname);
export const INTEGRATION_PREFIX = "/integration";
export const hostFor = (env: TrendyolEnv): string => TRENDYOL_HOSTS[env];

export function assertAllowed(url: string): void {
  const u = new URL(url);
  if (u.protocol !== "https:" || !ALLOWED_HOSTS.includes(u.hostname) || u.port) {
    throw new Error(`trendyol: host not allowlisted: ${u.hostname}`);
  }
}

/** docs/stock-and-price-update-updatepriceandinventory: "maximum 1,000 items" per request. */
export const MAX_INVENTORY_BATCH = 1000;
/** Same page: "maximum 20,000 stock per product". */
export const MAX_QUANTITY = 20000;
/** getShipmentPackages OpenAPI: `size` default 200, maximum 200. */
export const ORDER_PAGE_SIZE = 200;
/** docs/get-order-packages-getshipmentpackages: "If you use startDate and endDate parameters, the maximum allowable range is two weeks." */
export const MAX_ORDER_WINDOW_MS = 14 * 24 * 3600 * 1000;
/** Same page: offset window is capped at 10,000 packages = pages 0..49 at size 200 (use the stream endpoint beyond that). */
export const MAX_ORDER_PAGE = 49;
/** docs/authorization + service-limitations: 50 requests / 10 s per endpoint, then 429 `too.many.requests`. */
export const RATE_LIMIT = { requests: 50, windowSec: 10 } as const;

/** updatePriceAndInventory: POST { items: [{ barcode, quantity?, salePrice?, listPrice? }] } -> { batchRequestId }.
 *  Same request body within 15 minutes is rejected by Trendyol. Price/stock may be sent separately. */
export const inventoryUpdatePath = (sid: string) => `${INTEGRATION_PREFIX}/inventory/sellers/${sid}/products/price-and-inventory`;
/** getBatchRequestResult: GET -> { status, items: [{ status: "SUCCESS"|"FAILED", failureReasons: string[], requestItem }] }.
 *  For stock/price batches the doc says the batch-level status is not returned: check item statuses. */
export const batchResultPath = (sid: string, batchId: string) => `${INTEGRATION_PREFIX}/product/sellers/${sid}/products/batch-requests/${encodeURIComponent(batchId)}`;
/** getShipmentPackages. The legacy `/orders` endpoint is deprecated and the Order V2 endpoint is mandatory from 2026-10-15. */
export const shipmentPackagesPath = (sid: string) => `${INTEGRATION_PREFIX}/order/sellers/${sid}/v2/orders`;
/** getShipmentPackagesStream: cursor-based (GET ?lastModifiedStartDate&lastModifiedEndDate&size<=200&nextCursor -> { content, size, hasMore, nextCursor }),
 *  fixed order lastModifiedDate DESC, reaches further back than the offset endpoint. Used for reconciliation. */
export const shipmentPackagesStreamPath = (sid: string) => `${INTEGRATION_PREFIX}/order/sellers/${sid}/orders/stream`;
/** processAlternativeDelivery (self-integration cargo): PUT { isPhoneNumber, trackingInfo, params } -> package becomes "Shipped". */
export const alternativeDeliveryPath = (sid: string, pkgId: string) => `${INTEGRATION_PREFIX}/order/sellers/${sid}/shipment-packages/${encodeURIComponent(pkgId)}/alternative-delivery`;
/** updatePackage (Picking / Invoiced notifications): PUT { lines:[{lineId,quantity}], params:{invoiceNumber?}, status }. */
export const updatePackagePath = (sid: string, pkgId: string) => `${INTEGRATION_PREFIX}/order/sellers/${sid}/shipment-packages/${encodeURIComponent(pkgId)}`;
