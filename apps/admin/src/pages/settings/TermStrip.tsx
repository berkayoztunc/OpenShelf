import { Term } from "../../components/help/Term";
import { hasKey, useT } from "../../i18n";

/** Small "Terms: a · b · c" line that makes the jargon of a card clickable (glossary popovers). */
export function TermStrip({ ids }: { ids: string[] }) {
  const { t } = useT();
  const known = ids.filter((id) => hasKey(`glossary.${id}.term`)); // ids another agent has not added yet are skipped, never shown raw
  if (!known.length) return null;
  return (
    <p className="mb-4 mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
      <span>{t("settings.terms")}</span>
      {known.map((id, i) => <span key={id} className="inline-flex items-center gap-2">{i > 0 && <span aria-hidden>·</span>}<Term id={id} /></span>)}
    </p>
  );
}
