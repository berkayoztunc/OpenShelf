import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SystemSettings } from "@openshelf/shared";
import type { z } from "zod";
import { api, errMsg } from "../../lib/api";
import { useAdmin } from "../../lib/auth";
import { useSettings, type AllSettings } from "../../lib/settings";
import { Badge, Card, ConfirmDialog, ErrorState, Loading, cx, useToast } from "../../components/ui";
import { HelpText, HelpTip } from "../../components/help/HelpTip";
import { useT } from "../../i18n";
import { TermStrip } from "./TermStrip";

type System = z.infer<typeof SystemSettings>;

export default function System() {
  const { t } = useT();
  const q = useSettings();
  const admin = useAdmin();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirm, setConfirm] = useState<boolean | null>(null);
  const isOwner = admin?.role === "owner";
  const status = useQuery({ queryKey: ["mock-status"], queryFn: () => api.get<{ allowed: boolean; reason: string | null }>("/api/admin/mock/status") });
  const blockedByConfig = status.data?.allowed === false;

  const save = useMutation({
    mutationFn: (mockMode: boolean) => api.put<System>("/api/admin/settings/system", { mockMode }),
    onSuccess: (saved) => {
      qc.setQueryData<AllSettings>(["settings"], (old) => (old ? { ...old, system: saved } : old));
      toast.success(saved.mockMode ? t("settings.system.mock.toastOn") : t("settings.system.mock.toastOff"));
      setConfirm(null);
    },
    onError: (e) => { toast.error(errMsg(e)); setConfirm(null); },
  });

  if (q.isPending) return <Loading />;
  if (q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const on = q.data.system?.mockMode === true;
  const canToggle = isOwner && (on || !blockedByConfig);

  return (
    <Card title={t("settings.system.card.title")}>
      <div className="flex items-start justify-between gap-4">
        <div className="max-w-prose">
          <div className="flex items-center gap-1"><label htmlFor="mock-switch" className="text-sm font-medium">{t("settings.system.mock.label")}</label><HelpTip id="settings.mock" guide="getting-started#deneme-modu" /></div>
          <p className="mt-1 text-xs text-muted">{t("settings.system.mock.body")}</p>
          <TermStrip ids={["mock", "sandbox"]} />
          {blockedByConfig && !on && (
            <div role="note" className="mt-2 rounded border border-warn-line bg-warn-soft p-2 text-xs text-warn"><HelpText text={t("settings.system.mock.blocked")} /></div>
          )}
          {!isOwner && <p className="mt-2 text-xs text-warn">{t("settings.system.mock.ownerOnly")}</p>}
        </div>
        <button id="mock-switch" type="button" role="switch" aria-checked={on} disabled={!canToggle || save.isPending} onClick={() => setConfirm(!on)}
          className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50", on ? "bg-red-600" : "bg-faint")}>
          <span className={cx("absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform", on && "translate-x-5")} />
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4 text-xs text-muted" data-testid="mock-status">
        <span className="font-medium text-ink">{t("settings.system.status.label")}:</span>
        <Badge tone={on ? "warning" : "success"}>{on ? t("settings.system.status.on") : t("settings.system.status.off")}</Badge>
        {status.data && <span>{status.data.allowed ? t("settings.system.status.allowed") : t("settings.system.status.refused")}</span>}
      </div>
      <ConfirmDialog open={confirm !== null} danger={confirm === true} loading={save.isPending}
        title={confirm ? t("settings.system.mock.enableTitle") : t("settings.system.mock.disableTitle")}
        message={confirm ? t("settings.system.mock.enableMessage") : t("settings.system.mock.disableMessage")}
        confirmLabel={confirm ? t("settings.system.mock.enableAction") : t("settings.system.mock.disableAction")}
        onConfirm={() => confirm !== null && save.mutate(confirm)} onClose={() => setConfirm(null)} />
    </Card>
  );
}
