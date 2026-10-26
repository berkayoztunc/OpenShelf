import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";
import { api, errMsg } from "../lib/api";
import { INTEGRATIONS_KEY, PROVIDER_TERMS, GUIDE_ANCHOR, fieldHelp, fieldHelpId, fieldLabel, fieldPlaceholder, integrationName, optionLabel } from "../lib/integrations";
import { GLOSSARY_IDS } from "../i18n/glossary";
import { useT } from "../i18n";
import { Term } from "./help/Term";
import { GuideLink } from "./help/GuideLink";
import { buildSecretsPayload } from "../lib/secrets";
import type { SecretState } from "../lib/secrets";
import type { FieldDef, Integration } from "../lib/types";
import { Button, SelectField, TextField, Toggle, useToast } from "./ui";
import { SecretField } from "./SecretField";
import type { TestResult } from "./TestResult";
import { TestResultPanel } from "./TestResult";

export function PublicField({ f, value, onChange, error, provider = "" }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void; error?: string; provider?: string }) {
  const { t } = useT();
  const label = fieldLabel(provider, f); const hint = fieldHelp(provider, f); const help = fieldHelpId(provider, f.key);
  if (f.type === "boolean") return <Toggle label={label} hint={hint} help={help} checked={!!value} onChange={onChange} />;
  if (f.type === "select") return (
    <SelectField label={label} hint={hint} help={help} required={f.required} error={error} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("integrations.form.select")}</option>
      {f.options?.map((o) => typeof o === "string" ? <option key={o} value={o}>{optionLabel(provider, f, o, o)}</option> : <option key={o.value} value={o.value}>{optionLabel(provider, f, o.value, o.label)}</option>)}
    </SelectField>
  );
  return <TextField label={label} hint={hint} help={help} required={f.required} error={error} placeholder={fieldPlaceholder(provider, f)} type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
    value={String(value ?? "")} onChange={(e) => onChange(f.type === "number" ? (e.target.value === "" ? "" : Number(e.target.value)) : e.target.value)} />;
}

const blankSecrets = (it: Integration): Record<string, SecretState> => Object.fromEntries(it.secretFields.map((f) => [f.key, { mode: "keep", value: "" } as SecretState]));

/**
 * Manifest-driven config form (public fields + write-only secrets). Secret rules: stored values are never received
 * (only a server mask), only changed secrets are sent, typed values are dropped from memory after save, nothing is logged.
 */
export function IntegrationForm({ integration: it, mockMode, testResult, onTest, onSaved }: {
  integration: Integration; mockMode?: boolean; testResult?: TestResult; onTest?: () => void; onSaved?: () => void;
}) {
  const qc = useQueryClient(); const toast = useToast(); const { t } = useT();
  const [enabled, setEnabled] = useState(it.enabled);
  const [config, setConfig] = useState<Record<string, unknown>>(it.configPublic ?? {});
  const [secrets, setSecrets] = useState<Record<string, SecretState>>(() => blankSecrets(it));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mock = !!mockMode || !!it.mock;
  const terms = (PROVIDER_TERMS[it.provider] ?? []).filter((id) => GLOSSARY_IDS.includes(id));
  const secretsPayload = buildSecretsPayload(secrets);
  const dirty = enabled !== it.enabled || JSON.stringify(config) !== JSON.stringify(it.configPublic ?? {}) || !!secretsPayload;

  /** Required fields are enforced only when the integration is being enabled (drafts may be saved incomplete). */
  const validate = () => {
    const e: Record<string, string> = {};
    if (enabled) {
      for (const f of it.publicFields) if (f.required && f.type !== "boolean" && String(config[f.key] ?? "").trim() === "") e[f.key] = t("integrations.form.required", { label: fieldLabel(it.provider, f) });
      for (const f of it.secretFields) {
        const s = secrets[f.key]; const willHave = s?.mode === "set" ? s.value.trim() !== "" : s?.mode === "clear" ? false : !!it.secretsSet?.[f.key];
        if (f.required && !willHave) e[f.key] = t("integrations.form.required", { label: fieldLabel(it.provider, f) });
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const save = useMutation({
    mutationFn: () => api.put(`/api/admin/integrations/${it.provider}`, { enabled, config, ...(secretsPayload ? { secrets: secretsPayload } : {}) }),
    onSuccess: () => {
      setSecrets(blankSecrets(it)); // drop typed secrets from memory
      qc.invalidateQueries({ queryKey: INTEGRATIONS_KEY }); toast.success(t("integrations.toast.saved", { name: integrationName(it) })); onSaved?.();
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <form noValidate onSubmit={(e) => { e.preventDefault(); if (validate()) save.mutate(); }} className="flex min-h-full flex-col gap-5">
      {mock && (
        <p role="note" className="flex gap-2.5 rounded-lg border border-info-line bg-info-soft p-3 text-sm text-info"><Info size={16} className="mt-0.5 shrink-0" />
          <span>{t("integrations.form.mockNote")}</span></p>
      )}
      <Toggle label={t("integrations.form.enabled")} hint={t("integrations.form.enabledHint")} checked={enabled} onChange={setEnabled} />
      <div className="grid gap-4">
        {it.publicFields.map((f) => <PublicField key={f.key} f={f} provider={it.provider} value={config[f.key]} error={errors[f.key]} onChange={(v) => setConfig((c) => ({ ...c, [f.key]: v }))} />)}
        {it.secretFields.map((f) => (
          <SecretField key={f.key} label={fieldLabel(it.provider, f)} required={f.required} help={fieldHelp(it.provider, f)} helpId={fieldHelpId(it.provider, f.key)} error={errors[f.key]} isSet={!!it.secretsSet?.[f.key]} masked={it.secretsMasked?.[f.key]}
            state={secrets[f.key] ?? { mode: "keep", value: "" }} onChange={(s) => setSecrets((m) => ({ ...m, [f.key]: s }))} />
        ))}
        {!it.publicFields.length && !it.secretFields.length && <p className="text-sm text-muted">{t("integrations.form.noSettings")}</p>}
      </div>
      {it.secretFields.length > 0 && <p className="text-xs text-muted">{t("integrations.form.secretsNote")}</p>}
      {it.docsUrl && <a href={it.docsUrl} target="_blank" rel="noreferrer noopener" className="inline-flex w-fit items-center gap-1.5 text-sm font-medium text-brand-ink hover:underline">{t("integrations.form.docs")}<ExternalLink size={14} /></a>}
      {GUIDE_ANCHOR[it.provider] && <GuideLink guide={`integrations#${GUIDE_ANCHOR[it.provider]}`}>{t("integrations.drawer.guide")}</GuideLink>}
      {terms.length > 0 && <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted"><span>{t("integrations.drawer.terms")}:</span>{terms.map((id) => <Term key={id} id={id} />)}</p>}
      <TestResultPanel result={testResult} fallback={it.health} />
      <div className="sticky -bottom-5 -mx-5 -mb-5 mt-auto flex flex-wrap items-center justify-end gap-2 border-t border-line bg-surface px-5 py-3">
        {onTest && <Button variant="secondary" loading={testResult?.state === "running"} disabled={dirty && !mock} title={dirty && !mock ? t("integrations.form.saveFirst") : undefined} onClick={onTest}>{t("integrations.form.test")}</Button>}
        <Button type="submit" loading={save.isPending} disabled={!dirty || mock} title={mock ? t("integrations.form.mockSaveOff") : undefined}>{t("common.save")}</Button>
      </div>
    </form>
  );
}
