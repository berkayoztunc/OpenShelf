import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { TR_GEO } from "@openshelf/shared/src/trGeo";
import { api, errMsg } from "../lib/api";
import { useT } from "../i18n";
import { Button, Modal, SelectField, TextField, useToast } from "./ui";

export type OrderAddr = Partial<Record<"name" | "surname" | "phone" | "line1" | "line2" | "city" | "district" | "zip" | "country", string>>;
const TR_CITIES = TR_GEO.map((c) => c[1]);
const isTurkey = (a: OrderAddr) => !a.country || /^tr$/i.test(a.country);
const districtsOf = (city?: string) => TR_GEO.find((c) => c[1] === city)?.[2] ?? [];

/** What the carrier would reject: a Turkish address whose province or district is not one from the list. */
export function addressIssue(a: OrderAddr | undefined): "city" | "district" | null {
  if (!a || !isTurkey(a)) return null;
  if (!TR_CITIES.includes(a.city ?? "")) return "city";
  return districtsOf(a.city).includes(a.district ?? "") ? null : "district";
}

/** Delivery address as text plus a warning when the carrier will not recognise the province/district. */
export function AddressSummary({ a }: { a: OrderAddr | undefined }) {
  const { t } = useT();
  if (!a || !(a.line1 || a.name)) return <p className="text-sm text-muted">{t("orders.address.none")}</p>;
  const issue = addressIssue(a);
  return (
    <div className="text-sm">
      <address className="not-italic leading-relaxed text-muted">
        <span className="block font-medium text-ink">{[a.name, a.surname].filter(Boolean).join(" ")}</span>
        {a.phone && <span className="block">{a.phone}</span>}
        {a.line1 && <span className="block">{a.line1}</span>}
        {a.line2 && <span className="block">{a.line2}</span>}
        <span className="block">{[a.district, a.city].filter(Boolean).join(" / ")}{a.zip ? ` ${a.zip}` : ""}</span>
      </address>
      {issue && <p role="alert" className="mt-2 rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-xs text-warn">{t(`orders.address.issue.${issue}`, { value: (issue === "city" ? a.city : a.district) || "-" })}</p>}
    </div>
  );
}

/** Edit dialog: province and district come from the carrier's list (Turkey); saved with PUT /orders/:id/shipping-address. */
export function AddressDialog({ orderId, address, onClose }: { orderId: string; address: OrderAddr | undefined; onClose: () => void }) {
  const { t } = useT();
  const qc = useQueryClient(); const toast = useToast();
  const [f, setF] = useState<OrderAddr>({ ...address });
  const turkey = isTurkey(f);
  const districts = districtsOf(f.city);
  const set = (k: keyof OrderAddr) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const ok = !!f.name?.trim() && (f.phone?.trim().length ?? 0) >= 5 && (f.line1?.trim().length ?? 0) >= 3 && !!f.city?.trim() && (!turkey || (TR_CITIES.includes(f.city ?? "") && districts.includes(f.district ?? "")));
  const save = useMutation({
    mutationFn: () => api.put(`/api/admin/orders/${orderId}/shipping-address`, { name: f.name, surname: f.surname ?? "", phone: f.phone, line1: f.line1, line2: f.line2 ?? "", city: f.city, district: f.district ?? "", zip: f.zip ?? "" }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["order", orderId] }); toast.success(t("orders.address.saved")); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <Modal open onClose={onClose} title={t("orders.address.edit.title")}
      footer={<><Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={!ok} onClick={() => save.mutate()}>{t("common.save")}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="order-address-form">
        <TextField label={t("orders.address.name")} value={f.name ?? ""} onChange={set("name")} />
        <TextField label={t("orders.address.surname")} value={f.surname ?? ""} onChange={set("surname")} />
        <div className="sm:col-span-2"><TextField label={t("orders.address.phone")} type="tel" value={f.phone ?? ""} onChange={set("phone")} /></div>
        {turkey ? (
          <>
            <SelectField label={t("orders.address.city")} value={TR_CITIES.includes(f.city ?? "") ? f.city : ""} onChange={(e) => setF((s) => ({ ...s, city: e.target.value, district: "" }))}>
              <option value="">{t("orders.address.choose")}</option>{TR_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </SelectField>
            <SelectField label={t("orders.address.district")} hint={address?.district && !districts.includes(address.district) ? t("orders.address.wasDistrict", { value: address.district }) : undefined}
              disabled={!districts.length} value={districts.includes(f.district ?? "") ? f.district : ""} onChange={set("district")}>
              <option value="">{t("orders.address.choose")}</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}
            </SelectField>
          </>
        ) : (
          <>
            <TextField label={t("orders.address.city")} value={f.city ?? ""} onChange={set("city")} />
            <TextField label={t("orders.address.district")} value={f.district ?? ""} onChange={set("district")} />
          </>
        )}
        <div className="sm:col-span-2"><TextField label={t("orders.address.line1")} value={f.line1 ?? ""} onChange={set("line1")} /></div>
        <div className="sm:col-span-2"><TextField label={t("orders.address.line2")} value={f.line2 ?? ""} onChange={set("line2")} /></div>
        <TextField label={t("orders.address.zip")} value={f.zip ?? ""} onChange={set("zip")} />
      </div>
    </Modal>
  );
}
