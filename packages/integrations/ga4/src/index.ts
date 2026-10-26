export { factory, manifest, Ga4MpSink, ga4ConfigSchema, buildGa4Payload } from "./adapter";
export { purchaseEventId, uuidv5 } from "./eventId";
export { buildPurchaseEvent, buildPurchaseContext, type JobHandler } from "./marketing";

import { handlePurchaseGa4, type JobHandler } from "./marketing";
export const jobHandlers: Record<string, JobHandler> = {
  "marketing.purchase.ga4": handlePurchaseGa4,
};
