import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SETTING_GROUPS } from "@openshelf/shared";
import type { SettingGroup, SettingsOf } from "@openshelf/shared";
import { api, errMsg } from "./api";
import { tNow } from "../i18n";
import { useToast } from "../components/ui";

export type AllSettings = { [G in SettingGroup]: SettingsOf<G> };

export const useSettings = () => useQuery({ queryKey: ["settings"], queryFn: () => api.get<AllSettings>("/api/admin/settings") });

/** Draft-state form hook for one settings group, validated with the shared zod schema before PUT. */
export function useGroupForm<G extends SettingGroup>(group: G, prepare?: (d: SettingsOf<G>) => unknown) {
  const q = useSettings();
  const qc = useQueryClient();
  const toast = useToast();
  const [draft, setDraft] = useState<SettingsOf<G> | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (q.data && !draft) setDraft(q.data[group] as SettingsOf<G>); }, [q.data, draft, group]);

  const save = useMutation({
    mutationFn: async () => {
      if (!draft) throw new Error(tNow("settings.save.nothing"));
      const parsed = SETTING_GROUPS[group].safeParse(prepare ? prepare(draft) : draft);
      if (!parsed.success) {
        const map: Record<string, string> = {};
        for (const i of parsed.error.issues) map[i.path.join(".")] ||= i.message;
        setErrors(map);
        throw new Error(tNow("settings.save.fixFields"));
      }
      setErrors({});
      return api.put<SettingsOf<G>>(`/api/admin/settings/${group}`, parsed.data);
    },
    onSuccess: (saved) => {
      setDraft(saved);
      qc.setQueryData<AllSettings>(["settings"], (old) => (old ? { ...old, [group]: saved } : old));
      toast.success(tNow("settings.save.toast"));
    },
    onError: (e) => toast.error(errMsg(e)),
  });

  const patch = (p: Partial<SettingsOf<G>>) => setDraft((d) => (d ? { ...d, ...p } : d));
  const dirty = !!draft && !!q.data && JSON.stringify(draft) !== JSON.stringify(q.data[group]);
  return { query: q, draft, patch, errors, save, dirty };
}
