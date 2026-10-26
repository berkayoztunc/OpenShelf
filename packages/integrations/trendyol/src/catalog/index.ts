import type { MockHandler, TrendyolOperation } from "@openshelf/shared";
import { operations as catalogOps } from "./ops/catalog";
import { operations as productOps } from "./ops/products";
import { operations as orderOps } from "./ops/orders";
import { operations as claimOps } from "./ops/claims";
import { mockHandlers as catalogMock } from "./mock/catalog";
import { mockHandlers as productMock } from "./mock/products";
import { mockHandlers as orderMock } from "./mock/orders";
import { mockHandlers as claimMock } from "./mock/claims";

/** Every public Trendyol marketplace API operation (Turkey, docs v2.0), as data. */
export const TRENDYOL_OPERATIONS: TrendyolOperation[] = [...catalogOps, ...productOps, ...orderOps, ...claimOps];
export const TRENDYOL_MOCKS: Record<string, MockHandler> = { ...catalogMock, ...productMock, ...orderMock, ...claimMock };
export const getOperation = (id: string) => TRENDYOL_OPERATIONS.find((o) => o.id === id);
export { loadProducts, saveProducts, loadList, saveList, pageOf, seedProducts, type MockProduct } from "./mock/state";
