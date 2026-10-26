import { Link } from "react-router-dom";
import { useSettings } from "../lib/settings";
import { useT } from "../i18n";

/** Persistent, non-dismissible red banner while mock mode is on (external integrations are replaced by offline mocks). */
export function MockBanner() {
  const s = useSettings();
  const { t } = useT();
  if (!s.data?.system?.mockMode) return null;
  return (
    <div role="status" data-testid="mock-banner" className="border-b border-red-900 bg-red-700 dark:border-[#b0304a] dark:bg-[#82202f] px-4 py-1.5 text-center text-xs text-white">
      <strong className="mr-2 tracking-wide">{t("shell.mock.title")}</strong>
      {t("shell.mock.body")}{" "}
      <Link to="/mock-inbox" className="font-semibold underline">{t("shell.mock.inbox")}</Link>{" · "}
      <Link to="/settings/system" className="font-semibold underline">{t("shell.mock.off")}</Link>
    </div>
  );
}
