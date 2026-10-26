import type { ReactNode } from "react";
import { Button, ErrorState, Loading } from "../../components/ui";
import { useT } from "../../i18n";

/** Wraps a settings form: handles load/error states + sticky save button. */
export function SettingsForm({ query, onSave, saving, dirty, ready, children }: {
  query: { isPending: boolean; isError: boolean; error: unknown; refetch: () => unknown };
  onSave: () => void; saving: boolean; dirty: boolean; ready: boolean; children: ReactNode;
}) {
  const { t } = useT();
  if (query.isPending || !ready) return query.isError ? <ErrorState error={query.error} retry={() => query.refetch()} /> : <Loading />;
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave(); }} className="space-y-6">
      {children}
      <div className={`sticky bottom-3 z-10 flex items-center justify-end gap-3 rounded-xl border border-line bg-surface/95 px-4 py-3 shadow-lift backdrop-blur transition duration-200 ${dirty ? "" : "opacity-80"}`}>
        <span className="mr-auto flex items-center gap-2 text-sm text-muted" aria-live="polite">{dirty ? <><span aria-hidden className="size-2 animate-pulse rounded-full bg-data-warn" />{t("settings.save.unsaved")}</> : t("settings.save.saved")}</span>
        <Button type="submit" loading={saving} disabled={!dirty}>{t("settings.save.button")}</Button>
      </div>
    </form>
  );
}
