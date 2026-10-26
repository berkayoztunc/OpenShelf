import { useI18n } from "../i18n";

export function Pagination({ page, total, pageSize, onPage }: { page: number; total: number; pageSize: number; onPage: (p: number) => void }) {
  const { t } = useI18n();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label={t("page.label")} className="mt-14 flex items-center justify-center gap-4">
      <button className="btn-ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>{t("page.prev")}</button>
      <span className="text-sm text-muted" aria-live="polite">{t("page.of", { p: page, n: pages })}</span>
      <button className="btn-ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("page.next")}</button>
    </nav>
  );
}
