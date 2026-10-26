import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import type { Category } from "../lib/types";
import { categoryFromApi, categoryToApi, mapList } from "../lib/adapt";
import { SeoFields } from "../components/SeoCard";
import { SlugField } from "../components/Seo";
import { useT } from "../i18n";
import { Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, SelectField, Table, Td, TextField, useToast } from "../components/ui";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const useCategories = () => useQuery({ queryKey: ["categories"], queryFn: async () => { const r = await api.get<{ items: unknown[] }>("/api/admin/categories"); return mapList(r, categoryFromApi); } });

export default function Categories() {
  const { t } = useT();
  const q = useCategories();
  const qc = useQueryClient();
  const toast = useToast();
  const [edit, setEdit] = useState<Partial<Category> | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const [origSlug, setOrigSlug] = useState<string | undefined>();
  const openEdit = (c: Partial<Category> | null) => { setOrigSlug(c?.id ? c.slug : undefined); setEdit(c); };

  const save = useMutation({
    mutationFn: (c: Partial<Category>) => c.id ? api.put(`/api/admin/categories/${c.id}`, categoryToApi(c)) : api.post("/api/admin/categories", categoryToApi(c)),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); setEdit(null); toast.success(t("catalog.categories.saved")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/categories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["categories"] }); setDel(null); toast.success(t("catalog.categories.deleted")); },
    onError: (e) => toast.error(errMsg(e)),
  });

  return (
    <>
      <PageHeader title={t("catalog.categories.title")} description={t("catalog.categories.description")} guide="catalog#kategoriler" actions={<Button onClick={() => openEdit({ name: "", slug: "" })}>{t("catalog.categories.new")}</Button>} />
      <Card>
        {q.isPending ? <Loading /> : q.isError ? <ErrorState error={q.error} retry={() => q.refetch()} /> :
          q.data.length === 0 ? <EmptyState title={t("catalog.categories.empty.title")} description={t("catalog.categories.empty.body")} action={<Button onClick={() => openEdit({ name: "", slug: "" })}>{t("catalog.categories.empty.action")}</Button>} /> : (
            <Table head={[t("catalog.categories.col.name"), t("catalog.categories.col.slug"), t("catalog.categories.col.parent"), ""]} caption={t("catalog.categories.caption")}>{q.data.map((c) => (
              <tr key={c.id}><Td>{c.name}</Td><Td className="text-muted">{c.slug}</Td><Td>{q.data.find((p) => p.id === c.parentId)?.name ?? "-"}</Td>
                <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => openEdit(c)}>{t("common.edit")}</Button><Button size="sm" variant="ghost" onClick={() => setDel(c)}>{t("common.delete")}</Button></Td></tr>
            ))}</Table>
          )}
      </Card>
      <Modal wide open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? t("catalog.categories.modal.edit") : t("catalog.categories.modal.new")}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>{t("common.cancel")}</Button><Button loading={save.isPending} onClick={() => edit && save.mutate(edit)} disabled={!edit?.name}>{t("common.save")}</Button></>}>
        {edit && <div className="space-y-3">
          <TextField label={t("catalog.categories.name.label")} help="catalog.categoryName" hint={t("catalog.categories.name.hint")} value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value, slug: edit.id ? edit.slug : slugify(e.target.value) })} />
          <SlugField value={edit.slug ?? ""} onChange={(v) => setEdit({ ...edit, slug: slugify(v) })} origin={location.origin} pathPrefix="/category/" original={origSlug} />
          <SelectField label={t("catalog.categories.parent.label")} help="catalog.categoryParent" hint={t("catalog.categories.parent.hint")} value={edit.parentId ?? ""} onChange={(e) => setEdit({ ...edit, parentId: e.target.value || null })}>
            <option value="">{t("common.none")}</option>{q.data?.filter((c) => c.id !== edit.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </SelectField>
          <fieldset className="border-t border-line pt-4"><legend className="mb-3 pr-2 text-sm font-semibold">{t("catalog.categories.seo")}</legend>
            <SeoFields compact type="category" id={edit.id} value={edit} onChange={(p) => setEdit({ ...edit, ...p })}
              fallbackTitle={edit.name ?? ""} fallbackDescription={edit.name ? t("catalog.categories.fallbackDescNamed", { name: edit.name }) : t("catalog.categories.fallbackDesc")} path={`/category/${edit.slug ?? ""}`} />
          </fieldset>
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title={t("catalog.categories.delete.title")} message={t("catalog.categories.delete.message", { name: del?.name ?? "" })} confirmLabel={t("common.delete")} loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </>
  );
}
