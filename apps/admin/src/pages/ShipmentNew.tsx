import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useMutation } from "@tanstack/react-query";
import { TR_GEO } from "@openshelf/shared/src/trGeo";
import { api, errMsg } from "../lib/api";
import { money } from "../lib/format";
import { useT, type MessageKey } from "../i18n";
import { Typeahead } from "../components/Typeahead";
import type { ManualRecipient, ManualShipment, RecipientSource, ShippingQuotes } from "../lib/manualShipments";
import { Badge, Button, Card, ConfirmDialog, PageHeader, SelectField, TextArea, TextField, useToast } from "../components/ui";

const TR_CITIES = TR_GEO.map((c) => c[1]);
const districtsOf = (city?: string) => TR_GEO.find((c) => c[1] === city)?.[2] ?? [];
const empty: ManualRecipient = { name: "", surname: "", phone: "", email: "", line1: "", line2: "", city: "", district: "", zip: "" };
type Picked = { source: RecipientSource["source"]; label: string; customerId?: string; orderId?: string } | null;

/** Recipient check before asking the carrier: same rules as the API (Turkish province and district must come from the list). */
export function recipientIssues(r: ManualRecipient): string[] {
  const out: string[] = [];
  if (!r.name.trim()) out.push("name");
  if (r.phone.trim().length < 5) out.push("phone");
  if (r.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email.trim())) out.push("email");
  if (r.line1.trim().length < 3) out.push("line1");
  if (!TR_CITIES.includes(r.city)) out.push("city");
  else if (!districtsOf(r.city).includes(r.district ?? "")) out.push("district");
  return out;
}

export default function ShipmentNew() {
  const { t } = useT(); const nav = useNavigate(); const toast = useToast();
  const [r, setR] = useState<ManualRecipient>(empty);
  const [picked, setPicked] = useState<Picked>(null);
  const [search, setSearch] = useState("");
  const [contents, setContents] = useState(""); const [note, setNote] = useState("");
  const [weight, setWeight] = useState("0.5"); const [desi, setDesi] = useState("");
  const [service, setService] = useState("");
  const [ask, setAsk] = useState(false);
  const set = (k: keyof ManualRecipient) => (e: { target: { value: string } }) => { setR((s) => ({ ...s, [k]: e.target.value })); quotes.reset(); setService(""); };
  const kg = Number(weight.replace(",", ".")); const desiN = desi.trim() ? Number(desi) : undefined;
  const issues = recipientIssues(r);
  const parcelOk = kg >= 0.1 && kg <= 100 && (desiN === undefined || (Number.isInteger(desiN) && desiN >= 0 && desiN <= 1000));
  const clean = (): ManualRecipient => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, (v ?? "").trim()]).filter(([k, v]) => v !== "" || ["name", "phone", "line1", "city"].includes(k))) as unknown as ManualRecipient;
  const parcel = () => ({ recipient: clean(), weightKg: kg, ...(desiN ? { desi: desiN } : {}) });
  const quotes = useMutation({
    mutationFn: () => api.post<ShippingQuotes>("/api/admin/manual-shipments/quotes", parcel()),
    onSuccess: (q) => setService(q.items[0]?.serviceId ?? ""),
  });
  const create = useMutation({
    mutationFn: () => api.post<ManualShipment>("/api/admin/manual-shipments", {
      ...parcel(), serviceId: service, contents: contents.trim(), ...(note.trim() ? { note: note.trim() } : {}),
      ...(picked?.customerId ? { customerId: picked.customerId } : {}), ...(picked?.orderId ? { orderId: picked.orderId } : {}),
    }),
    onSuccess: (s) => { toast.success(t("shipments.toast.created", { ref: s.reference })); nav(`/shipments?open=${s.id}`); },
    onError: (e) => { setAsk(false); toast.error(errMsg(e)); },
  });
  const err = (k: string) => (issues.includes(k) && (r as unknown as Record<string, string>)[k] ? t(`shipments.issue.${k}` as MessageKey) : undefined);
  const chosen = quotes.data?.items.find((q) => q.serviceId === service);
  const districts = districtsOf(r.city);

  return (
    <>
      <PageHeader title={t("shipments.new")} description={t("shipments.new.description")} actions={<Link to="/shipments"><Button variant="ghost">{t("common.back")}</Button></Link>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("shipments.recipient")}>
            <div className="mb-4">
              <Typeahead<RecipientSource> label={t("shipments.recipient.search")} path="/api/admin/manual-shipments/recipients" value={search} onChange={setSearch} minChars={2}
                placeholder={t("shipments.recipient.search.placeholder")} hint={t("shipments.recipient.search.hint")}
                render={(x) => <span className="flex flex-col"><span><Badge tone={x.source === "order" ? "info" : "neutral"}>{t(`shipments.source.${x.source}`)}</Badge> <span className="font-medium">{x.label}</span></span><span className="text-xs text-muted">{x.detail}</span></span>}
                onPick={(x) => { setSearch(""); setR({ ...empty, ...x.recipient }); setPicked({ source: x.source, label: x.label, customerId: x.customerId, orderId: x.orderId }); quotes.reset(); setService(""); }} />
              {picked && <p className="mt-2 text-xs text-muted">{t("shipments.recipient.from", { source: t(`shipments.source.${picked.source}`), label: picked.label })} <button type="button" className="underline" onClick={() => { setPicked(null); setR(empty); }}>{t("shipments.recipient.clear")}</button></p>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2" data-testid="shipment-recipient">
              <TextField label={t("orders.address.name")} required value={r.name} onChange={set("name")} />
              <TextField label={t("orders.address.surname")} value={r.surname ?? ""} onChange={set("surname")} />
              <TextField label={t("orders.address.phone")} required type="tel" value={r.phone} error={err("phone")} onChange={set("phone")} />
              <TextField label={t("shipments.email")} type="email" value={r.email ?? ""} error={err("email")} onChange={set("email")} />
              <SelectField label={t("orders.address.city")} required value={TR_CITIES.includes(r.city) ? r.city : ""} hint={r.city && !TR_CITIES.includes(r.city) ? t("orders.address.wasDistrict", { value: r.city }) : undefined}
                onChange={(e) => { setR((s) => ({ ...s, city: e.target.value, district: "" })); quotes.reset(); setService(""); }}>
                <option value="">{t("orders.address.choose")}</option>{TR_CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </SelectField>
              <SelectField label={t("orders.address.district")} required disabled={!districts.length} value={districts.includes(r.district ?? "") ? r.district : ""}
                hint={r.district && !districts.includes(r.district) ? t("orders.address.wasDistrict", { value: r.district }) : undefined} onChange={set("district")}>
                <option value="">{t("orders.address.choose")}</option>{districts.map((d) => <option key={d} value={d}>{d}</option>)}
              </SelectField>
              <div className="sm:col-span-2"><TextField label={t("orders.address.line1")} required value={r.line1} error={err("line1")} onChange={set("line1")} /></div>
              <div className="sm:col-span-2"><TextField label={t("orders.address.line2")} value={r.line2 ?? ""} onChange={set("line2")} /></div>
              <TextField label={t("orders.address.zip")} value={r.zip ?? ""} onChange={set("zip")} />
            </div>
          </Card>
          <Card title={t("shipments.parcel")}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2"><TextField label={t("shipments.contents")} required maxLength={200} placeholder={t("shipments.contents.placeholder")} hint={t("shipments.contents.hint")} value={contents} onChange={(e) => setContents(e.target.value)} /></div>
              <TextField label={t("shipments.weightKg")} required inputMode="decimal" value={weight} error={weight && !(kg >= 0.1 && kg <= 100) ? t("shipments.issue.weight") : undefined} onChange={(e) => { setWeight(e.target.value); quotes.reset(); setService(""); }} />
              <TextField label={t("shipments.desi")} inputMode="numeric" hint={t("shipments.desi.hint")} value={desi} onChange={(e) => { setDesi(e.target.value); quotes.reset(); setService(""); }} />
              <div className="sm:col-span-2"><TextArea label={t("shipments.note")} hint={t("shipments.note.hint")} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
            </div>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={t("shipments.offer")}>
            <div className="space-y-3">
              {issues.length > 0 && <p className="text-sm text-muted">{t("shipments.offer.fillFirst")}</p>}
              <Button variant="secondary" disabled={issues.length > 0 || !parcelOk} loading={quotes.isPending} onClick={() => quotes.mutate()}>{t("shipments.offer.load")}</Button>
              {quotes.isError && <p role="alert" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{errMsg(quotes.error)}</p>}
              {quotes.data?.testMode && <p role="note" className="rounded-lg border border-warn-line bg-warn-soft px-3 py-2 text-sm text-warn">{t("orders.ship.testMode")}</p>}
              {quotes.data && (quotes.data.items.length ? (
                <SelectField label={t("orders.ship.service")} value={service} onChange={(e) => setService(e.target.value)}>
                  {quotes.data.items.map((q) => <option key={q.serviceId} value={q.serviceId}>{`${q.carrier} · ${money(q.price, q.currency)}${q.etaDays ? ` · ${t("orders.ship.eta", { days: q.etaDays })}` : ""}`}</option>)}
                </SelectField>
              ) : <p role="alert" className="text-sm text-warn">{t("orders.ship.noQuotes")}</p>)}
              <Button className="w-full" disabled={!service || !contents.trim() || issues.length > 0 || !parcelOk} onClick={() => setAsk(true)}>{t("shipments.buy")}</Button>
              <p className="text-xs text-muted">{t("shipments.buy.hint")}</p>
            </div>
          </Card>
        </div>
      </div>
      <ConfirmDialog open={ask} title={t("shipments.buy.title")} confirmLabel={t("shipments.buy")} loading={create.isPending}
        message={t("shipments.buy.body", { name: [r.name, r.surname].filter(Boolean).join(" "), city: [r.district, r.city].filter(Boolean).join(" / "), carrier: chosen?.carrier ?? service, price: chosen ? money(chosen.price, chosen.currency) : "-" })}
        onConfirm={() => create.mutate()} onClose={() => !create.isPending && setAsk(false)} />
    </>
  );
}
