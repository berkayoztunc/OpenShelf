/**
 * Unit-economics ("profit matrix") calculator. Pure functions, all amounts in minor units (kuruş).
 *
 * Model (Turkish e-commerce, prices VAT-inclusive):
 *  - price           gross sale price incl. VAT (what the customer pays)
 *  - commission      price × commission% (marketplace / payment fee; its invoice carries VAT)
 *  - shipping        carrier fee incl. VAT
 *  - cost            purchase cost incl. VAT
 *  - outputVat       VAT inside the sale price  = price − price / (1 + vat)
 *  - inputVat        VAT inside commission + shipping + cost (deductible), at the same rate
 *  - vatPayable      max(0, outputVat − inputVat)  (an excess carries forward, it is not cash back)
 *  - preTax          price − commission − shipping − cost − vatPayable
 *  - withholding     e-commerce stopaj on the VAT-exclusive price (credited against income tax)
 *  - incomeTax       max(preTax × incomeTax%, withholding) — the cash tax burden of the sale
 *  - net             preTax − incomeTax ; margin = net / price
 */
export type Channel = "website" | "trendyol";

export interface ProfitParams {
  commissionPct: number;
  /** Shipping fee per unit in minor units, VAT-inclusive. */
  shipping: number;
  vatPct: number;
  incomeTaxPct: number;
  withholdingPct: number;
}

export interface ProfitInput extends ProfitParams {
  price: number;
  /** Unit cost in minor units, VAT-inclusive. */
  cost: number;
}

export interface ProfitBreakdown {
  price: number; commission: number; shipping: number; cost: number;
  outputVat: number; inputVat: number; vatPayable: number;
  preTax: number; withholding: number; incomeTax: number;
  net: number; margin: number;
}

const r = Math.round;
const pct = (v: number) => (Number.isFinite(v) ? Math.max(0, v) / 100 : 0);
const amt = (v: number) => (Number.isFinite(v) ? Math.max(0, v) : 0);

export function computeProfit(i: ProfitInput): ProfitBreakdown {
  const price = amt(i.price);
  const vat = pct(i.vatPct);
  const commission = r(price * pct(i.commissionPct));
  const shipping = r(amt(i.shipping));
  const cost = r(amt(i.cost));
  const vatIn = (gross: number) => gross - gross / (1 + vat);
  const outputVat = r(vatIn(price));
  const inputVat = r(vatIn(commission + shipping + cost));
  const vatPayable = Math.max(0, outputVat - inputVat);
  const preTax = price - commission - shipping - cost - vatPayable;
  const withholding = r((price - outputVat) * pct(i.withholdingPct));
  const incomeTax = Math.max(r(Math.max(0, preTax) * pct(i.incomeTaxPct)), withholding);
  const net = preTax - incomeTax;
  return { price, commission, shipping, cost, outputVat, inputVat, vatPayable, preTax, withholding, incomeTax, net, margin: price > 0 ? net / price : 0 };
}

export const DEFAULT_PARAMS: Record<Channel, ProfitParams> = {
  website: { commissionPct: 3, shipping: 9000, vatPct: 20, incomeTaxPct: 25, withholdingPct: 0 },
  trendyol: { commissionPct: 18, shipping: 9000, vatPct: 20, incomeTaxPct: 25, withholdingPct: 1 },
};

/** Per-variant overrides the operator typed into the matrix (blank = use the channel default). */
export interface RowOverride { cost?: number; commissionPct?: number; shipping?: number }
export interface ProfitState { params: Record<Channel, ProfitParams>; rows: Record<string, RowOverride> }

const STORE_KEY = "os_admin_profit_matrix";
export function loadProfitState(): ProfitState {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<ProfitState>;
      return {
        params: { website: { ...DEFAULT_PARAMS.website, ...s.params?.website }, trendyol: { ...DEFAULT_PARAMS.trendyol, ...s.params?.trendyol } },
        rows: s.rows && typeof s.rows === "object" ? s.rows : {},
      };
    }
  } catch { /* storage blocked or corrupt — fall back to defaults */ }
  return { params: { website: { ...DEFAULT_PARAMS.website }, trendyol: { ...DEFAULT_PARAMS.trendyol } }, rows: {} };
}
export function saveProfitState(s: ProfitState) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* ignore */ }
}
