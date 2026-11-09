export { factory, manifest, TrendyolProvider, TrendyolError, trendyolConfigSchema, mapPackage, mapContent, flattenCategoryTree } from "./adapter";
export { mapTrendyolStatus, TRENDYOL_PACKAGE_STATUSES, isImportableStatus } from "./status";
export {
  buildRequest, execute, mapError, runCall, ConsoleError, opAvailableOn, userAgentFor, basicAuth, MAX_BODY_BYTES, MAX_RESPONSE_BYTES, CALL_TIMEOUT_MS,
  type ConsoleCreds, type BuiltRequest, type ExecResponse, type FetchLike, type RunDeps, type ConsoleErrorCode,
} from "./console";
export { hostFor, RATE_LIMIT as TRENDYOL_RATE_LIMIT, MAX_INVENTORY_BATCH, MAX_QUANTITY } from "./endpoints";
export { computeStockDrift, type DriftInput, type DriftItem } from "./drift";
export { stockDriftReport, importTrendyolOrder, ORDERS_CURSOR_KEY, applyTrendyolProducts, loadImportStatus, PRODUCTS_STATUS_KEY, slugify, type ImportStatus, type ImportTotals, type JobHandler } from "./handlers";

import { importProducts, reconcileOrders, stockPush, type JobHandler } from "./handlers";
export const jobHandlers: Record<string, JobHandler> = {
  "trendyol.stock_push": stockPush,
  "trendyol.reconcile_orders": reconcileOrders,
  "trendyol.import_products": importProducts,
};
export { TRENDYOL_OPERATIONS, TRENDYOL_MOCKS, getOperation, loadProducts, saveProducts, loadList, saveList, pageOf, seedProducts, type MockProduct } from "./catalog";
