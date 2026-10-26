import { CheckCircle2, Copy, XCircle } from "lucide-react";
import { dateTime } from "../lib/format";
import { tNow, useT } from "../i18n";
import { Spinner, useToast } from "./ui";

export type TestResult = { state: "running" } | { state: "ok" | "fail"; detail?: string; at: string };

/**
 * Translates the stable phrases adapters return as health-check detail; anything else is shown as the server sent it
 * (provider error text is not ours to translate). Exported for tests.
 */
export function localizeDetail(detail: string): string {
  const d = detail.trim();
  if (/^(mock mode: )+no external call made\.?$/i.test(d)) return tNow("testResult.detail.mock");
  const mockRest = /^(?:mock mode: )+(.+)$/i.exec(d);
  if (mockRest) return tNow("testResult.detail.mockPrefix") + localizeDetail(mockRest[1]!);
  const exact: [RegExp, string][] = [
    [/^token active \(sending permission not verified\)\.?$/i, "testResult.detail.tokenActive"],
    [/^pixel reachable\.?$/i, "testResult.detail.pixelReachable"],
    [/^payload validated\.?$/i, "testResult.detail.payloadValidated"],
    [/^invalid account sid\.?$/i, "testResult.detail.invalidSid"],
    [/^account active\.?$/i, "testResult.detail.accountActive"],
  ];
  for (const [re, key] of exact) if (re.test(d)) return tNow(key);
  const kv: [RegExp, string][] = [[/^balance: (.+)$/i, "testResult.detail.balance"], [/^account status: (.+)$/i, "testResult.detail.accountStatus"], [/^token status: (.+)$/i, "testResult.detail.tokenStatus"]];
  for (const [re, key] of kv) { const m = re.exec(d); if (m) return tNow(key, { v: m[1]! }); }
  const http = /^HTTP (\d{3})\b/.exec(d);
  if (http) {
    const n = Number(http[1]);
    return tNow(n === 401 || n === 403 ? "testResult.detail.http401" : n === 429 ? "testResult.detail.http429" : n >= 500 ? "testResult.detail.http5xx" : "testResult.detail.http", { raw: d });
  }
  return detail;
}

/** Inline connection-test outcome: spinner while running, then green/red result with detail, timestamp and copy-error. Falls back to the last stored health. */
export function TestResultPanel({ result, fallback, compact }: { result?: TestResult; fallback?: { ok: boolean; detail?: string; at?: string } | null; compact?: boolean }) {
  const toast = useToast();
  const { t } = useT();
  const r: TestResult | undefined = result ?? (fallback?.at ? { state: fallback.ok ? "ok" : "fail", detail: fallback.detail, at: fallback.at } : undefined);
  if (!r) return null;
  if (r.state === "running") return <p role="status" className="flex items-center gap-2 rounded-lg border border-line bg-hover px-3 py-2 text-sm text-muted"><Spinner className="h-4 w-4" />{t("testResult.running")}</p>;
  const ok = r.state === "ok";
  const text = r.detail ? localizeDetail(r.detail) : undefined;
  const copy = async () => {
    try { await navigator.clipboard.writeText(r.detail ?? ""); toast.info(t("testResult.copied")); } catch { toast.error(t("testResult.copyFail")); }
  };
  return (
    <div role={ok ? "status" : "alert"} data-testid="test-result" data-state={r.state}
      className={`rounded-lg border px-3 py-2 text-sm ${ok ? "border-success-line bg-success-soft text-success" : "border-danger-line bg-danger-soft text-danger"}`}>
      <p className="flex items-start gap-2">
        {ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <XCircle size={16} className="mt-0.5 shrink-0" />}
        <span className="min-w-0 flex-1 break-words"><strong className="font-semibold">{ok ? t("testResult.ok") : t("testResult.fail")}</strong>{text && !compact ? ` - ${text}` : text && compact ? ` - ${text.length > 70 ? text.slice(0, 70) + "..." : text}` : ""}</span>
        {!ok && r.detail && <button type="button" onClick={copy} aria-label={t("testResult.copy")} title={t("testResult.copy")} className="-my-0.5 grid size-6 shrink-0 place-items-center rounded-md transition hover:bg-hover"><Copy size={14} /></button>}
      </p>
      <p className="mt-0.5 pl-6 text-xs opacity-80">{dateTime(r.at)}</p>
    </div>
  );
}
