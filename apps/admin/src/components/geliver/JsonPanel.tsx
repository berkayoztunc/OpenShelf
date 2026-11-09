import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { Button, TextField, useToast } from "../ui";
import { JsonTree } from "../trendyol/JsonTree";
import { useT } from "../../i18n";

const pretty = (v: unknown) => { try { return JSON.stringify(v, null, 2); } catch { return String(v); } };

/** JSON viewer for API payloads: collapsible tree (search, expand/collapse all, copy path/value) or raw text, plus copy-all. */
export function JsonPanel({ value, maxHeight = "60vh" }: { value: unknown; maxHeight?: string }) {
  const { t } = useT(); const toast = useToast();
  const [view, setView] = useState<"tree" | "raw">("tree");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [expandKey, setExpandKey] = useState(0);
  const raw = useMemo(() => pretty(value), [value]);
  const set = (e: boolean | null) => { setExpanded(e); setExpandKey((k) => k + 1); };
  const copy = () => void navigator.clipboard?.writeText(raw).then(() => toast.success(t("common.copied")));
  return (
    <div className="space-y-2" data-testid="gl-json">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1"><TextField label={t("geliver.json.search")} value={search} onChange={(e) => setSearch(e.target.value)} disabled={view === "raw"} /></div>
        <Button size="sm" variant={view === "tree" ? "primary" : "secondary"} onClick={() => setView("tree")}>{t("geliver.json.tree")}</Button>
        <Button size="sm" variant={view === "raw" ? "primary" : "secondary"} onClick={() => setView("raw")}>{t("geliver.json.raw")}</Button>
        {view === "tree" && <><Button size="sm" variant="ghost" onClick={() => set(true)}>{t("geliver.json.expand")}</Button><Button size="sm" variant="ghost" onClick={() => set(false)}>{t("geliver.json.collapse")}</Button></>}
        <Button size="sm" variant="secondary" onClick={copy}><Copy size={13} />{t("geliver.json.copy")}</Button>
      </div>
      <div className="overflow-auto rounded-lg border border-line bg-canvas p-3" style={{ maxHeight }}>
        {view === "tree" ? <JsonTree value={value} search={search} expanded={expanded} expandKey={expandKey} /> : <pre className="font-mono text-xs">{raw}</pre>}
      </div>
    </div>
  );
}
