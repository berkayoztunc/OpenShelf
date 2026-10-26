import { useId } from "react";
import type { SecretState } from "../lib/secrets";
import { Button } from "./ui";
import { HelpTip } from "./help/HelpTip";
import { useT } from "../i18n";

/**
 * Write-only secret input. Never receives the stored value, only the server-provided mask.
 * keep  -> shows masked placeholder + Change button
 * set   -> shows a password input
 * clear -> shows "will be removed" + Undo
 */
export function SecretField({ label, isSet, masked, state, onChange, help, helpId, required, error }: {
  label: string; isSet: boolean; masked?: string; state: SecretState; onChange: (s: SecretState) => void; help?: string; /** id of a rich "?" help entry (`help.<id>.*`) */ helpId?: string; required?: boolean; error?: string;
}) {
  const id = useId();
  const { t } = useT();
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1"><label htmlFor={id} className="block text-sm font-medium">{label}{required && <span aria-hidden className="ml-0.5 text-danger"> *</span>}</label>{helpId && <HelpTip id={helpId} />}</div>
      {state.mode === "set" ? (
        <div className="flex gap-2">
          <input id={id} type="password" autoComplete="new-password" spellCheck={false} value={state.value} placeholder={t("secret.enterNew")}
            onChange={(e) => onChange({ mode: "set", value: e.target.value })}
            aria-invalid={!!error || undefined} className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm focus:border-brand-600 focus:ring-4 focus:ring-brand-600/15 aria-[invalid=true]:border-danger" />
          <Button variant="ghost" size="sm" onClick={() => onChange({ mode: "keep", value: "" })}>{t("common.cancel")}</Button>
        </div>
      ) : state.mode === "clear" ? (
        <div className="flex items-center gap-3 text-sm"><span id={id} className="text-danger">{t("secret.removed")}</span>
          <Button variant="ghost" size="sm" onClick={() => onChange({ mode: "keep", value: "" })}>{t("secret.undo")}</Button></div>
      ) : (
        <div className="flex items-center gap-2">
          <input id={id} type="text" readOnly disabled value={isSet ? (masked || "••••••••") : ""} placeholder={t("secret.notSet")} aria-label={t(isSet ? "secret.aria.set" : "secret.aria.unset", { label })}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2 text-sm text-muted" />
          <Button variant="secondary" size="sm" onClick={() => onChange({ mode: "set", value: "" })}>{isSet ? t("secret.change") : t("secret.set")}</Button>
          {isSet && <Button variant="ghost" size="sm" onClick={() => onChange({ mode: "clear", value: "" })}>{t("common.clear")}</Button>}
        </div>
      )}
      {help && <p className="text-xs text-muted">{help}</p>}
      {error && <p role="alert" className="text-xs text-danger">{error}</p>}
    </div>
  );
}
