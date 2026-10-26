export { factory, manifest, MetaCapiSink, metaConfigSchema, buildCapiEvent, buildUserData } from "./adapter";
export { purchaseEventId, uuidv5 } from "./eventId";
export { sha256Hex, normalizeEmail, normalizePhone, normalizeExternalId } from "./hash";
export { buildMetaFeed, buildMetaFeedXml, buildMetaFeedCsv, formatFeedPrice, type FeedProduct } from "./feed";
export { buildPurchaseEvent, buildPurchaseContext, type JobHandler } from "./marketing";

import { handlePurchaseMeta, type JobHandler } from "./marketing";
export const jobHandlers: Record<string, JobHandler> = {
  "marketing.purchase.meta": handlePurchaseMeta,
};
