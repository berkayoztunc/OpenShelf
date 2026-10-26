// Source: https://docs.geliver.io/llms.txt + llms-full.txt (2026-10). Base https://api.geliver.io/api/v1, Bearer token.
export const BASE_URL = "https://api.geliver.io/api/v1";
export const ALLOWED_HOSTS: readonly string[] = ["api.geliver.io"];
export const paths = {
  priceList: "/priceList",
  transactions: "/transactions",
  shipment: (id: string) => `/shipments/${encodeURIComponent(id)}`,
  address: (id: string) => `/addresses/${encodeURIComponent(id)}`,
};
// UNVERIFIED: recipientAddress.cityName accepted when cityCode (plate code) is unknown - docs only show cityCode in requests
//   (cityName appears in response objects). We send cityCode when `city` is numeric, else cityName.
// UNVERIFIED: priceList query uses a single parcel (length,width,height,weight) - multi-parcel quotes use the sum of weights.
// UNVERIFIED: Geliver webhooks (TRACK_UPDATED) have no documented signature mechanism; no webhook verification is implemented.
