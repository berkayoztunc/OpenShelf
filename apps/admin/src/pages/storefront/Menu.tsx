import { useState } from "react";
import { ArrowDown, ArrowUp, Link2, Tag, Trash2 } from "lucide-react";
import type { SettingsOf } from "@openshelf/shared";
import { useGroupForm } from "../../lib/settings";
import { Badge, Button, Card, SelectField, TextField, Toggle } from "../../components/ui";
import { useT } from "../../i18n";
import { useCategories } from "../Categories";
import { SettingsForm } from "../settings/SaveBar";

type Item = SettingsOf<"menu">["items"][number];
const MAX_ITEMS = 12;
const newId = () => `m${Math.random().toString(36).slice(2, 10)}`;

export default function Menu() {
  const { t } = useT();
  const { query, draft, patch, errors, save, dirty } = useGroupForm("menu");
  const cats = useCategories();
  const [pick, setPick] = useState("");
  const all = cats.data ?? [];
  const catName = (id: string | null) => all.find((c) => c.id === id)?.name;
  const items = draft?.items ?? [];
  const setItems = (next: Item[]) => patch({ items: next });
  const change = (i: number, p: Partial<Item>) => setItems(items.map((x, n) => (n === i ? { ...x, ...p } : x)));
  const move = (i: number, d: -1 | 1) => { const n = i + d; if (n < 0 || n >= items.length) return; const a = [...items]; [a[i], a[n]] = [a[n]!, a[i]!]; setItems(a); };
  const used = new Set(items.filter((x) => x.type === "category").map((x) => x.categoryId));
  const free = all.filter((c) => !used.has(c.id));
  const room = items.length < MAX_ITEMS;
  const addCategory = () => { if (!pick || !room) return; setItems([...items, { id: newId(), type: "category", categoryId: pick, label: "", labelEn: "", url: "", newTab: false, showChildren: true }]); setPick(""); };
  const addLink = () => room && setItems([...items, { id: newId(), type: "link", categoryId: null, label: "", labelEn: "", url: "", newTab: false, showChildren: true }]);
  /** Switching to manual: start from what the automatic menu shows today, so nothing disappears. */
  const setAuto = (auto: boolean) => {
    if (auto || items.length > 0) return patch({ auto });
    patch({ auto, items: all.filter((c) => !c.parentId).slice(0, 4).map((c) => ({ id: newId(), type: "category" as const, categoryId: c.id, label: "", labelEn: "", url: "", newTab: false, showChildren: true })) });
  };
  const preview = [...(draft?.showProductsLink ? [t("settings.menu.productsLink")] : []), ...items.map((x) => x.label.trim() || (x.type === "category" ? catName(x.categoryId) : "") || "?")];

  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <>
        <Card title={t("settings.menu.mode.title")}>
          <Toggle label={t("settings.menu.auto.label")} hint={t("settings.menu.auto.hint")} checked={draft.auto} onChange={setAuto} />
        </Card>
        {!draft.auto && <Card title={t("settings.menu.items.title")} description={t("settings.menu.items.description", { max: MAX_ITEMS })}>
          <div className="space-y-4">
            <Toggle label={t("settings.menu.products.label")} hint={t("settings.menu.products.hint")} checked={draft.showProductsLink} onChange={(v) => patch({ showProductsLink: v })} />
            {items.length === 0 && <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-muted">{t("settings.menu.items.empty")}</p>}
            <ol className="space-y-3">{items.map((it, i) => {
              const err = errors[`items.${i}.label`] ?? errors[`items.${i}.url`];
              return (
                <li key={it.id} className="rounded-xl border border-line bg-canvas/50 p-3">
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="grid size-7 place-items-center rounded-lg bg-hover text-muted">{it.type === "category" ? <Tag size={14} /> : <Link2 size={14} />}</span>
                    <span className="text-sm font-medium">{it.type === "category" ? catName(it.categoryId) ?? t("settings.menu.item.missingCategory") : it.label || t("settings.menu.item.newLink")}</span>
                    <Badge>{t(it.type === "category" ? "settings.menu.type.category" : "settings.menu.type.link")}</Badge>
                    {it.type === "category" && !catName(it.categoryId) && <Badge tone="danger">{t("settings.menu.item.missingBadge")}</Badge>}
                    <span className="ml-auto flex items-center gap-1">
                      <Button type="button" size="sm" variant="ghost" aria-label={t("settings.menu.item.up", { n: i + 1 })} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={14} /></Button>
                      <Button type="button" size="sm" variant="ghost" aria-label={t("settings.menu.item.down", { n: i + 1 })} disabled={i === items.length - 1} onClick={() => move(i, 1)}><ArrowDown size={14} /></Button>
                      <Button type="button" size="sm" variant="ghost" aria-label={t("settings.menu.item.remove", { n: i + 1 })} onClick={() => setItems(items.filter((_, n) => n !== i))}><Trash2 size={14} /></Button>
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label={t("settings.menu.item.label")} maxLength={40} placeholder={it.type === "category" ? catName(it.categoryId) : ""} hint={it.type === "category" ? t("settings.menu.item.label.catHint") : undefined} value={it.label} error={err} onChange={(e) => change(i, { label: e.target.value })} />
                    <TextField label={t("settings.menu.item.labelEn")} maxLength={40} value={it.labelEn} onChange={(e) => change(i, { labelEn: e.target.value })} />
                    {it.type === "link" && <>
                      <TextField label={t("settings.menu.item.url")} placeholder="/page/kampanyalar" hint={t("settings.menu.item.url.hint")} value={it.url} onChange={(e) => change(i, { url: e.target.value })} />
                      <Toggle label={t("settings.menu.item.newTab")} checked={it.newTab} onChange={(v) => change(i, { newTab: v })} />
                    </>}
                    {it.type === "category" && <div className="sm:col-span-2"><Toggle label={t("settings.menu.item.children")} hint={t("settings.menu.item.children.hint")} checked={it.showChildren} onChange={(v) => change(i, { showChildren: v })} /></div>}
                  </div>
                </li>
              );
            })}</ol>
            <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
              <div className="min-w-56 flex-1"><SelectField label={t("settings.menu.add.category")} value={pick} disabled={!room || free.length === 0} onChange={(e) => setPick(e.target.value)}>
                <option value="">{free.length === 0 ? t("settings.menu.add.noneLeft") : t("settings.menu.add.choose")}</option>{free.map((c) => <option key={c.id} value={c.id}>{c.parentId ? "— " : ""}{c.name}</option>)}</SelectField></div>
              <Button type="button" variant="secondary" disabled={!pick || !room} onClick={addCategory}>{t("settings.menu.add.categoryButton")}</Button>
              <Button type="button" variant="secondary" disabled={!room} onClick={addLink}>{t("settings.menu.add.link")}</Button>
              {!room && <span className="basis-full text-xs text-muted">{t("settings.menu.add.full", { max: MAX_ITEMS })}</span>}
            </div>
          </div>
        </Card>}
        <Card title={t("settings.menu.preview.title")} description={draft.auto ? t("settings.menu.preview.auto") : undefined}>
          <nav aria-label={t("settings.menu.preview.title")} className="flex flex-wrap gap-x-6 gap-y-2 rounded-lg border border-line bg-canvas px-4 py-3 text-sm font-medium">
            {draft.auto ? <><span>{t("settings.menu.productsLink")}</span>{all.filter((c) => !c.parentId).slice(0, 4).map((c) => <span key={c.id} className="text-muted">{c.name}</span>)}</> : preview.map((p, i) => <span key={i} className={i === 0 && draft.showProductsLink ? "" : "text-muted"}>{p}</span>)}
          </nav>
        </Card>
      </>}
    </SettingsForm>
  );
}
