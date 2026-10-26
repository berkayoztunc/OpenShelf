import { Badge, cx } from "../ui";
import type { Tone } from "../ui";
import { useT } from "../../i18n";
import type { Risk, TrendyolEnv, TrendyolOperation } from "../../lib/trendyol";

const METHOD_TONE: Record<string, string> = {
  GET: "bg-info-soft text-info ring-info-line",
  POST: "bg-success-soft text-success ring-success-line",
  PUT: "bg-warn-soft text-warn ring-warn-line",
  PATCH: "bg-hover text-muted ring-line-strong",
  DELETE: "bg-danger-soft text-danger ring-danger-line",
};
/** GET / POST / PUT / PATCH / DELETE chip, colour coded with the theme tokens. */
export function MethodChip({ method, className }: { method: string; className?: string }) {
  return <span className={cx("inline-flex min-w-[3.1rem] items-center justify-center rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold tracking-wide ring-1 ring-inset", METHOD_TONE[method] ?? METHOD_TONE.PATCH, className)}>{method}</span>;
}

const RISK_DOT: Record<Risk, string> = { read: "bg-info", write: "bg-warn", destructive: "bg-danger" };
const RISK_TONE: Record<Risk, Tone> = { read: "info", write: "warning", destructive: "danger" };
export function RiskDot({ risk }: { risk: Risk }) {
  const { td } = useT();
  return <span role="img" aria-label={td(`trendyol.risk.${risk}`)} title={td(`trendyol.risk.${risk}`)} className={cx("inline-block size-2 shrink-0 rounded-full", RISK_DOT[risk])} />;
}
export function RiskBadge({ risk }: { risk: Risk }) {
  const { td } = useT();
  return <Badge tone={RISK_TONE[risk]}>{td(`trendyol.risk.${risk}`)}</Badge>;
}

/** Deprecated / stage-only badges of an operation. */
export function OpFlags({ op, compact }: { op: TrendyolOperation; compact?: boolean }) {
  const { t } = useT();
  const stageOnly = op.envs && op.envs.length === 1 && op.envs[0] === "stage";
  if (!op.deprecated && !stageOnly) return null;
  const cls = "rounded px-1 text-[10px] font-semibold uppercase ring-1 ring-inset";
  return (
    <>
      {op.deprecated && <span className={cx(cls, "bg-warn-soft text-warn ring-warn-line")}>{compact ? t("trendyol.flag.deprecatedShort") : t("trendyol.flag.deprecated")}</span>}
      {stageOnly && <span className={cx(cls, "bg-info-soft text-info ring-info-line")}>{compact ? t("trendyol.flag.stageShort") : t("trendyol.flag.stageOnly")}</span>}
    </>
  );
}

export function EnvPill({ env }: { env: TrendyolEnv }) {
  const { t } = useT();
  return <span className={cx("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", env === "production" ? "bg-danger-soft text-danger ring-danger-line" : "bg-info-soft text-info ring-info-line")}>{t(env === "production" ? "trendyol.env.production" : "trendyol.env.stage")}</span>;
}
