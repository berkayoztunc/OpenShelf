export function formatMoney(minor: number, currency: string, locale: string): string {
  try {
    return new Intl.NumberFormat(locale === "tr" ? "tr-TR" : "en-US", { style: "currency", currency }).format(minor / 100);
  } catch { return `${(minor / 100).toFixed(2)} ${currency}`; }
}
