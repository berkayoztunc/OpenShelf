import type { MockState } from "@openshelf/shared";

/** Shared offline product model (what the mock "Trendyol account" holds). Prices are TRY major units like the real API. */
export interface MockProduct {
  barcode: string; stockCode: string; productMainId: string; productContentId: number; title: string; description: string;
  brandId: number; brand: string; categoryId: number; categoryName: string; vatRate: number;
  quantity: number; salePrice: number; listPrice: number; currencyType: "TRY";
  images: string[]; attributes: { attributeId: number; attributeName: string; attributeValueId?: number; attributeValue?: string }[];
  approved: boolean; archived: boolean; locked: boolean; onSale: boolean; blacklisted: boolean;
  createDateTime: number; lastUpdateDate: number;
}

const KEY = "ty:products";
const IMG = (n: number) => `https://cdn.dsmcdn.com/mock/openshelf/${n}.jpg`;
/** Same demo catalog as tooling/seed so mock orders/products line up with local variants. */
const SEED: Array<Pick<MockProduct, "barcode" | "stockCode" | "title" | "salePrice" | "listPrice" | "quantity" | "categoryName" | "categoryId" | "brand" | "brandId">> = [
  { barcode: "8680000000011", stockCode: "DEMO-SERAMIK-VAZO-1", title: "Seramik Vazo - S", salePrice: 384, listPrice: 449, quantity: 18, categoryName: "Ev Dekorasyon", categoryId: 411, brand: "OpenShelf", brandId: 9001 },
  { barcode: "8680000000012", stockCode: "DEMO-SERAMIK-VAZO-2", title: "Seramik Vazo - L", salePrice: 449, listPrice: 520, quantity: 9, categoryName: "Ev Dekorasyon", categoryId: 411, brand: "OpenShelf", brandId: 9001 },
  { barcode: "8680000000021", stockCode: "DEMO-KETEN-YASTIK-1", title: "Keten Yastık - Krem", salePrice: 269, listPrice: 299, quantity: 40, categoryName: "Yastık", categoryId: 512, brand: "OpenShelf", brandId: 9001 },
  { barcode: "8680000000031", stockCode: "DEMO-MUM-SETI-1", title: "Soya Mum Seti - Standart", salePrice: 319, listPrice: 369, quantity: 25, categoryName: "Mum", categoryId: 613, brand: "OpenShelf", brandId: 9001 },
  { barcode: "8680000000041", stockCode: "DEMO-AHSAP-RAF-2", title: "Ahşap Duvar Rafı - 90 cm", salePrice: 959, listPrice: 1099, quantity: 4, categoryName: "Raf", categoryId: 714, brand: "OpenShelf", brandId: 9001 },
  { barcode: "8680000000051", stockCode: "DEMO-BATTANIYE-1", title: "Örme Battaniye - Bej", salePrice: 849, listPrice: 979, quantity: 0, categoryName: "Battaniye", categoryId: 815, brand: "OpenShelf", brandId: 9001 },
];
export function seedProducts(now = Date.now()): MockProduct[] {
  return SEED.map((s, i) => ({
    ...s, productMainId: s.stockCode.replace(/-\d$/, ""), productContentId: 100000 + i, description: `${s.title} — OpenShelf demo ürünü.`,
    vatRate: 20, currencyType: "TRY", images: [IMG(i + 1)], attributes: [{ attributeId: 47, attributeName: "Renk", attributeValueId: 1001 + i, attributeValue: "Bej" }],
    approved: true, archived: false, locked: false, onSale: s.quantity > 0, blacklisted: false, createDateTime: now - (30 - i) * 86_400_000, lastUpdateDate: now - i * 3_600_000,
  }));
}
export async function loadProducts(state: MockState): Promise<MockProduct[]> {
  let list = await state.get<MockProduct[]>(KEY);
  if (!list) { list = seedProducts(state.now()); await state.set(KEY, list); }
  return list;
}
export const saveProducts = (state: MockState, list: MockProduct[]) => state.set(KEY, list);

/** Generic helper for other groups: seeded list stored under `key`. */
export async function loadList<T>(state: MockState, key: string, seed: () => T[]): Promise<T[]> {
  let list = await state.get<T[]>(key);
  if (!list) { list = seed(); await state.set(key, list); }
  return list;
}
export const saveList = <T,>(state: MockState, key: string, list: T[]) => state.set(key, list);

/** Trendyol-style paging wrapper (content/page/size/totalElements/totalPages). */
export function pageOf<T>(all: T[], page: number, size: number) {
  const totalPages = Math.max(1, Math.ceil(all.length / size));
  return { content: all.slice(page * size, page * size + size), page, size, totalElements: all.length, totalPages };
}
