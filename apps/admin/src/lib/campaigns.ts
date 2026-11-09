/** GSM 03.38 basic + extension set: text outside it (e.g. Turkish ş ğ ı İ) is sent as UCS-2 with far shorter segments. */
const GSM = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\r\n^{}\\[~\]|€]*$/;
export function smsSegments(text: string): { chars: number; segments: number; unicode: boolean } {
  const chars = [...text].length; const unicode = !GSM.test(text);
  const [single, multi] = unicode ? [70, 67] : [160, 153];
  return { chars, unicode, segments: chars === 0 ? 0 : chars <= single ? 1 : Math.ceil(chars / multi) };
}
export interface CampaignFilters { minOrders?: number; orderedWithinDays?: number; city?: string }
export interface CampaignRow { id: string; name: string; channel: "email" | "sms"; subject?: string | null; status: "draft" | "sending" | "done" | "cancelled" | "failed"; total: number; sent: number; failed: number; skipped: number; createdAt: string | number; startedAt?: string | number | null; finishedAt?: string | number | null }
export interface CampaignFull extends CampaignRow { body: string; filters: CampaignFilters; pending: number; problems: { id: string; to: string; status: string; error?: string | null }[] }
/** Percent done (sent + failed + skipped of total). */
export const progressOf = (c: Pick<CampaignRow, "total" | "sent" | "failed" | "skipped">) => (c.total ? Math.round(((c.sent + c.failed + c.skipped) / c.total) * 100) : 0);
