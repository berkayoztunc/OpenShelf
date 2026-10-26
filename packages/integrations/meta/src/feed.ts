/** Meta catalog feed (RSS 2.0 + g: namespace XML, and CSV). `id` == variant id == Pixel content_ids. */
export interface FeedProduct {
  id: string;            // variant id
  title: string;
  description: string;
  availableStock: number;
  price: number;         // minor units (kurus)
  currency?: string;     // default TRY
  link: string;
  imageLink: string;
  brand?: string | null;
  itemGroupId?: string | null; // product id
}

export const FEED_FIELDS = [
  "id", "title", "description", "availability", "condition", "price", "link", "image_link", "brand", "item_group_id",
] as const;

export function formatFeedPrice(minor: number, currency = "TRY"): string {
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(Math.round(minor));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")} ${currency.toUpperCase()}`;
}

function row(p: FeedProduct): Record<(typeof FEED_FIELDS)[number], string> {
  return {
    id: p.id, title: p.title.slice(0, 200), description: (p.description || p.title).slice(0, 9999),
    availability: p.availableStock > 0 ? "in stock" : "out of stock", condition: "new",
    price: formatFeedPrice(p.price, p.currency), link: p.link, image_link: p.imageLink,
    brand: p.brand ?? "", item_group_id: p.itemGroupId ?? "",
  };
}

// eslint-disable-next-line no-control-regex
const XML_INVALID = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g;
export function escapeXml(s: string): string {
  return s.replace(XML_INVALID, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function escapeCsv(s: string): string {
  const v = s.replace(/\r?\n/g, " ");
  return /[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

export function buildMetaFeedXml(products: FeedProduct[], shop: { title: string; link: string } = { title: "OpenShelf", link: "" }): string {
  const items = products.map((p) => {
    const r = row(p);
    const fields = FEED_FIELDS.filter((k) => r[k] !== "").map((k) => `      <g:${k}>${escapeXml(r[k])}</g:${k}>`);
    return `    <item>\n${fields.join("\n")}\n    </item>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n  <channel>\n    <title>${escapeXml(shop.title)}</title>\n    <link>${escapeXml(shop.link)}</link>\n${items.join("\n")}\n  </channel>\n</rss>\n`;
}

export function buildMetaFeedCsv(products: FeedProduct[]): string {
  const lines = [FEED_FIELDS.join(",")];
  for (const p of products) { const r = row(p); lines.push(FEED_FIELDS.map((k) => escapeCsv(r[k])).join(",")); }
  return lines.join("\n") + "\n";
}

/** Used by the API worker's /feeds/meta.xml|csv routes. */
export function buildMetaFeed(products: FeedProduct[], shop?: { title: string; link: string }): { xml: string; csv: string } {
  return { xml: buildMetaFeedXml(products, shop), csv: buildMetaFeedCsv(products) };
}
