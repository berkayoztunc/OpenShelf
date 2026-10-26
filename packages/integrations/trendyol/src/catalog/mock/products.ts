import type { MockHandler } from "@openshelf/shared";
/** Offline handlers keyed by operationId. Filled by the catalog agents. */
export const mockHandlers: Record<string, MockHandler> = {};
