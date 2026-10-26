import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import { useT } from "../i18n";
import { dateTime, enumLabel, money, toMajor, toMinor } from "../lib/format";
import type { Coupon } from "../lib/types";
import { couponFromApi, mapList } from "../lib/adapt";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Loading, Modal, PageHeader, SelectField, Table, Td, TextField, Toggle, useToast } from "../components/ui";

interface Form { id?: string; code: string; type: "percent" | "fixed"; value: string; minSubtotal: string; maxUses: string; expiresAt: string; active: boolean }
const blank: Form = { code: "", type: "percent", value: "10", minSubtotal: "", maxUses: "", expiresAt: "", active: true };

export default function Coupons() {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const list = useQuery({ queryKey: ["coupons"], queryFn: async () => { const r = await api.get<{ items: unknown[] }>("/api/admin/coupons"); return mapList(r, couponFromApi); } });
  const [f, setF] = useState<Form | null>(null);
  const [del, setDel] = useState<Coupon | null>(null);
  const save = useMutation({
    mutationFn: (x: Form) => {
      const body = { code: x.code.trim().toUpperCase(), type: x.type, value: x.type === "fixed" ? toMinor(x.value) : Number(x.value),
        minSubtotal: x.minSubtotal ? toMinor(x.minSubtotal) : null, maxUses: x.maxUses ? Number(x.maxUses) : null, expiresAt: x.expiresAt ? new Date(x.expiresAt).toISOString() : null, active: x.active };
      return x.id ? api.put(`/api/admin/coupons/${encodeURIComponent(x.id)}`, body) : api.post("/api/admin/coupons", body);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); setF(null); toast.success(t("catalog.coupons.saved")); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/coupons/${encodeURIComponent(id)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["coupons"] }); setDel(null); toast.success(t("catalog.coupons.deleted")); }, onError: (e) => toast.error(errMsg(e)),
  });
  const edit = (c: Coupon) => setF({ id: c.id, code: c.code, type: c.type, value: c.type === "fixed" ? toMajor(c.value) : String(c.value), minSubtotal: c.minSubtotal ? toMajor(c.minSubtotal) : "", maxUses: c.maxUses ? String(c.maxUses) : "", expiresAt: c.expiresAt?.slice(0, 10) ?? "", active: c.active });

  return (
    <>
      <PageHeader title={t("catalog.coupons.title")} description={t("catalog.coupons.description")} guide="catalog#kuponlar" actions={<Button onClick={() => setF(blank)}>{t("catalog.coupons.new")}</Button>} />
      <Card>
        {list.isPending ? <Loading /> : list.isError ? <ErrorState error={list.error} retry={() => list.refetch()} /> :
          list.data.length === 0 ? <EmptyState title={t("catalog.coupons.empty.title")} description={t("catalog.coupons.empty.body")} action={<Button onClick={() => setF(blank)}>{t("catalog.coupons.empty.action")}</Button>} /> : (
            <Table head={[t("catalog.coupons.col.code"), t("catalog.coupons.col.discount"), t("catalog.coupons.col.used"), t("catalog.coupons.col.expires"), t("catalog.coupons.col.status"), ""]} caption={t("catalog.coupons.caption")}>{list.data.map((c) => (
              <tr key={c.id}><Td className="font-mono">{c.code}</Td><Td>{c.type === "percent" ? `${c.value}%` : money(c.value)}<span className="block text-xs text-muted">{enumLabel("couponType", c.type)}</span></Td><Td>{c.usedCount ?? 0}{c.maxUses ? ` / ${c.maxUses}` : ""}</Td><Td>{c.expiresAt ? dateTime(c.expiresAt) : t("catalog.coupons.never")}</Td>
                <Td><Badge tone={c.active ? "success" : "neutral"}>{c.active ? t("catalog.coupons.active") : t("catalog.coupons.inactive")}</Badge></Td>
                <Td className="text-right"><Button size="sm" variant="ghost" onClick={() => edit(c)}>{t("common.edit")}</Button><Button size="sm" variant="ghost" onClick={() => setDel(c)}>{t("common.delete")}</Button></Td></tr>
            ))}</Table>
          )}
      </Card>
      <Modal open={!!f} onClose={() => setF(null)} title={f?.id ? t("catalog.coupons.modal.edit") : t("catalog.coupons.modal.new")}
        footer={<><Button variant="ghost" onClick={() => setF(null)}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={!f?.code || !f?.value} onClick={() => f && save.mutate(f)}>{t("common.save")}</Button></>}>
        {f && <div className="space-y-3">
          <TextField label={t("catalog.coupons.code.label")} help="catalog.couponCode" hint={t("catalog.coupons.code.hint")} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} />
          <div className="grid grid-cols-2 gap-3">
            <SelectField label={t("catalog.coupons.type.label")} help="catalog.couponType" hint={t("catalog.coupons.type.hint")} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as Form["type"] })}><option value="percent">{enumLabel("couponType", "percent")}</option><option value="fixed">{enumLabel("couponType", "fixed")}</option></SelectField>
            <TextField label={f.type === "percent" ? t("catalog.coupons.value.percent") : t("catalog.coupons.value.amount")} help="catalog.couponValue" hint={f.type === "percent" ? t("catalog.coupons.value.hintPercent") : t("catalog.coupons.value.hintAmount")} inputMode="decimal" value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} />
            <TextField label={t("catalog.coupons.min.label")} help="catalog.couponMin" hint={t("catalog.coupons.min.hint")} inputMode="decimal" value={f.minSubtotal} onChange={(e) => setF({ ...f, minSubtotal: e.target.value })} />
            <TextField label={t("catalog.coupons.max.label")} help="catalog.couponMax" hint={t("catalog.coupons.max.hint")} type="number" min={1} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} />
          </div>
          <TextField label={t("catalog.coupons.expires.label")} help="catalog.couponExpires" hint={t("catalog.coupons.expires.hint")} type="date" value={f.expiresAt} onChange={(e) => setF({ ...f, expiresAt: e.target.value })} />
          <Toggle label={t("catalog.coupons.activeToggle.label")} help="catalog.couponActive" hint={t("catalog.coupons.activeToggle.hint")} checked={f.active} onChange={(v) => setF({ ...f, active: v })} />
        </div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title={t("catalog.coupons.delete.title")} message={t("catalog.coupons.delete.message", { code: del?.code ?? "" })} confirmLabel={t("common.delete")} loading={remove.isPending} onConfirm={() => del && remove.mutate(del.id)} onClose={() => setDel(null)} />
    </>
  );
}
