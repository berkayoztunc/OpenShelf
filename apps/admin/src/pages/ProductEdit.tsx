import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errMsg } from "../lib/api";
import { enumLabel, toMajor, toMinor } from "../lib/format";
import { useT } from "../i18n";
import { HelpTip } from "../components/help/HelpTip";
import { TermText } from "../components/TermText";
import { Term } from "../components/help/Term";
import { MEDIA_ACCEPT, mediaUrl, uploadMedia } from "../lib/media";
import type { Product, ProductImage } from "../lib/types";
import { productFromApi, productToApi } from "../lib/adapt";
import { SeoFields } from "../components/SeoCard";
import { SeoChecklist, SlugField } from "../components/Seo";
import { productChecks } from "../lib/seo";
import { Button, Card, ConfirmDialog, ErrorState, Loading, Modal, PageHeader, SelectField, TextArea, TextField, useToast } from "../components/ui";
import { useCategories } from "./Categories";

interface VForm { id?: string; sku: string; barcode: string; title: string; options: string; website: string; trendyol: string; stock?: { total: number; reserved: number }; initialStock: string }
interface PForm { name: string; slug: string; description: string; status: Product["status"]; categoryId: string; variants: VForm[]; images: ProductImage[]; seoTitle: string; seoDescription: string; seoOgMediaId: string | null; seoOgImageUrl: string; seoNoindex: boolean; seoCanonical: string }

const emptyVariant = (): VForm => ({ sku: "", barcode: "", title: "Default", options: "", website: "", trendyol: "", initialStock: "0" });
const optsToString = (o?: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).join(", ");
const stringToOpts = (s: string) => Object.fromEntries(s.split(",").map((p) => p.split("=").map((x) => x.trim())).filter((p): p is [string, string] => !!p[0] && !!p[1]));
const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/ı/g, "i").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function fromProduct(p: Product): PForm {
  return {
    name: p.name, slug: p.slug, description: p.description ?? "", status: p.status, categoryId: p.categoryId ?? "",
    variants: p.variants.map((v) => ({ id: v.id, sku: v.sku, barcode: v.barcode ?? "", title: v.title, options: optsToString(v.options), website: toMajor(v.prices.website), trendyol: toMajor(v.prices.trendyol), stock: v.stock, initialStock: "0" })),
    images: [...(p.images ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    seoTitle: p.seoTitle ?? "", seoDescription: p.seoDescription ?? "", seoOgMediaId: p.seoOgMediaId ?? null, seoOgImageUrl: p.seoOgImageUrl ?? "",
    seoNoindex: !!p.seoNoindex, seoCanonical: p.seoCanonical ?? "",
  };
}

export default function ProductEdit() {
  const { t } = useT();
  const { id } = useParams();
  const isNew = !id;
  const nav = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useCategories();
  const q = useQuery({ queryKey: ["product", id], enabled: !isNew, queryFn: async () => productFromApi(await api.get<unknown>(`/api/admin/products/${id}`)) });
  const [f, setF] = useState<PForm>({ name: "", slug: "", description: "", status: "draft", categoryId: "", variants: [emptyVariant()], images: [], seoTitle: "", seoDescription: "", seoOgMediaId: null, seoOgImageUrl: "", seoNoindex: false, seoCanonical: "" });
  const [slugTouched, setSlugTouched] = useState(false);
  const [adjust, setAdjust] = useState<VForm | null>(null);
  const [adj, setAdj] = useState({ delta: "", reason: "" });
  const [imgUrl, setImgUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const [archiveAsk, setArchiveAsk] = useState(false);

  useEffect(() => { if (q.data) { setF(fromProduct(q.data)); setSlugTouched(true); } }, [q.data]);
  const setV = (i: number, p: Partial<VForm>) => setF((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, ...p } : v)) }));

  const save = useMutation({
    mutationFn: () => {
      const body = productToApi({
        name: f.name, slug: f.slug, description: f.description, status: f.status, categoryId: f.categoryId || null,
        variants: f.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}), sku: v.sku, barcode: v.barcode || null, title: v.title, options: stringToOpts(v.options),
          prices: { website: toMinor(v.website), trendyol: v.trendyol.trim() === "" ? null : toMinor(v.trendyol) },
          ...(v.id ? {} : { stock: { total: Number(v.initialStock) || 0 } }),
        })),
        images: f.images,
        seoTitle: f.seoTitle, seoDescription: f.seoDescription, seoOgMediaId: f.seoOgMediaId, seoOgImageUrl: f.seoOgImageUrl, seoNoindex: f.seoNoindex, seoCanonical: f.seoCanonical,
      });
      return isNew ? api.post<{ id: string }>("/api/admin/products", body) : api.put<{ id: string }>(`/api/admin/products/${id}`, body);
    },
    onSuccess: (p) => { setArchiveAsk(false); qc.invalidateQueries({ queryKey: ["products"] }); qc.invalidateQueries({ queryKey: ["product", id] }); toast.success(t("catalog.product.saved")); if (isNew && p?.id) nav(`/products/${p.id}`, { replace: true }); },
    onError: (e) => { setArchiveAsk(false); toast.error(errMsg(e)); },
  });

  const doAdjust = useMutation({
    mutationFn: () => api.post(`/api/admin/inventory/${adjust!.id}/adjust`, { delta: parseInt(adj.delta, 10), reason: adj.reason }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["product", id] }); setAdjust(null); setAdj({ delta: "", reason: "" }); toast.success(t("catalog.adjust.toast")); },
    onError: (e) => toast.error(errMsg(e)),
  });

  async function upload(files: FileList | null) {
    const fl = files?.[0]; if (!fl) return;
    setUploading(true);
    try { const r = await uploadMedia(fl, "product"); setF((s) => ({ ...s, images: [...s.images, { mediaId: r.id, alt: "" }] })); }
    catch (e) { toast.error(errMsg(e)); } finally { setUploading(false); if (file.current) file.current.value = ""; }
  }
  const moveImg = (i: number, d: -1 | 1) => setF((s) => { const a = [...s.images]; const j = i + d; if (j < 0 || j >= a.length) return s; [a[i], a[j]] = [a[j]!, a[i]!]; return { ...s, images: a }; });

  if (!isNew && q.isPending) return <Loading />;
  if (!isNew && q.isError) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const firstImg = f.images[0] ? (f.images[0].url ?? mediaUrl(f.images[0].mediaId)) : null;
  const checks = productChecks({
    title: f.seoTitle, name: f.name, description: f.description, metaDescription: f.seoDescription, slug: f.slug, images: f.images,
    hasOgImage: !!f.seoOgMediaId || !!f.seoOgImageUrl, hasPrice: f.variants.length > 0 && f.variants.every((v) => v.website.trim() !== ""),
    hasStock: f.variants.some((v) => (v.id ? (v.stock?.total ?? 0) : Number(v.initialStock) || 0) > 0), noindex: f.seoNoindex,
  });
  const valid = f.name.trim() && f.slug.trim() && f.variants.length > 0 && f.variants.every((v) => v.sku.trim() && v.title.trim() && v.website.trim() !== "");

  const wasArchived = q.data?.status === "archived";
  const adjDelta = /^-?\d+$/.test(adj.delta) ? parseInt(adj.delta, 10) : null;
  const adjFrom = adjust?.stock?.total ?? 0;
  const onSubmit = () => { if (!valid) return; if (f.status === "archived" && !wasArchived) setArchiveAsk(true); else save.mutate(); };

  return (
    <>
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <PageHeader title={isNew ? t("catalog.product.new") : f.name || t("catalog.product.edit")} description={t("catalog.product.description")} guide="catalog#urun-ekleme"
        actions={<><Link to="/products"><Button variant="ghost">{t("common.back")}</Button></Link><Button type="submit" loading={save.isPending} disabled={!valid}>{t("common.save")}</Button></>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={t("catalog.product.card.details")}>
            <div className="space-y-4">
              <TextField label={t("catalog.product.name.label")} help="catalog.productName" hint={t("catalog.product.name.hint")} required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: slugTouched ? f.slug : slugify(e.target.value) })} />
              <TextArea label={t("catalog.product.desc.label")} help="catalog.productDescription" hint={t("catalog.product.desc.hint")} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </div>
          </Card>
          <Card title={t("catalog.product.card.variants")} actions={<Button size="sm" variant="secondary" onClick={() => setF({ ...f, variants: [...f.variants, emptyVariant()] })}>{t("catalog.variants.addButton")}</Button>}>
            <p className="mb-2 text-xs text-muted">{t("catalog.variants.intro")}</p>
            <p className="mb-4 text-xs text-muted"><TermText text={t("catalog.variants.terms")} /></p>
            <div className="space-y-5">
              {f.variants.map((v, i) => (
                <fieldset key={v.id ?? `n${i}`} className="rounded-xl border border-line p-4">
                  <legend className="px-2 text-sm font-medium">{t("catalog.variants.legend", { n: i + 1 })}</legend>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <TextField label={t("catalog.variants.title.label")} help="catalog.variantTitle" hint={t("catalog.variants.title.hint")} required value={v.title} onChange={(e) => setV(i, { title: e.target.value })} />
                    <TextField label={t("catalog.variants.sku.label")} help="catalog.sku" hint={t("catalog.variants.sku.hint")} required value={v.sku} onChange={(e) => setV(i, { sku: e.target.value })} />
                    <TextField label={t("catalog.variants.barcode.label")} help="catalog.barcode" hint={t("catalog.variants.barcode.hint")} value={v.barcode} onChange={(e) => setV(i, { barcode: e.target.value })} />
                    <TextField label={t("catalog.variants.options.label")} help="catalog.variantOptions" hint={t("catalog.variants.options.hint")} placeholder={t("catalog.variants.options.placeholder")} value={v.options} onChange={(e) => setV(i, { options: e.target.value })} />
                    <TextField label={t("catalog.variants.website.label")} help="catalog.priceWebsite" hint={t("catalog.variants.website.hint")} required inputMode="decimal" value={v.website} onChange={(e) => setV(i, { website: e.target.value })} />
                    <TextField label={t("catalog.variants.trendyol.label")} help="catalog.priceTrendyol" hint={t("catalog.variants.trendyol.hint")} inputMode="decimal" value={v.trendyol} onChange={(e) => setV(i, { trendyol: e.target.value })} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    {v.id ? (
                      <p className="flex flex-wrap items-center gap-x-1 text-sm">{t("catalog.variants.stock")} <strong>{v.stock?.total ?? 0}</strong> <span className="text-muted">{t("catalog.variants.reserved", { n: v.stock?.reserved ?? 0 })}</span><HelpTip id="catalog.stock" />
                        <Button size="sm" variant="secondary" className="ml-3" onClick={() => setAdjust(v)}>{t("catalog.variants.adjust")}</Button></p>
                    ) : <TextField label={t("catalog.variants.initialStock.label")} help="catalog.initialStock" hint={t("catalog.variants.initialStock.hint")} type="number" min={0} value={v.initialStock} onChange={(e) => setV(i, { initialStock: e.target.value })} className="max-w-32" />}
                    {f.variants.length > 1 && !v.id && <Button size="sm" variant="ghost" onClick={() => setF({ ...f, variants: f.variants.filter((_, j) => j !== i) })}>{t("catalog.variants.remove")}</Button>}
                  </div>
                </fieldset>
              ))}
            </div>
          </Card>
          <Card title={t("catalog.product.card.images")}>
            <p className="mb-3 flex items-start gap-1 text-xs text-muted"><span>{t("catalog.images.intro")}</span><HelpTip id="catalog.images" /></p>
            <ul className="mb-4 space-y-3">
              {f.images.map((im, i) => (
                <li key={`${im.id ?? im.url ?? im.mediaId}-${i}`} className="flex flex-wrap items-center gap-3 sm:flex-nowrap">
                  <img src={im.url ?? mediaUrl(im.mediaId)} alt={im.alt || t("catalog.images.alt")} className="h-16 w-16 shrink-0 rounded-lg border border-line object-cover" />
                  <input aria-label={t("catalog.images.altAria", { n: i + 1 })} placeholder={t("catalog.images.altPlaceholder")} className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2 text-sm ${im.alt?.trim() ? "border-line" : "border-warn-line"}`} value={im.alt ?? ""}
                    onChange={(e) => setF((s) => ({ ...s, images: s.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) }))} />
                  <Button size="sm" variant="ghost" aria-label={t("catalog.images.up")} disabled={i === 0} onClick={() => moveImg(i, -1)}>{t("catalog.images.upLabel")}</Button>
                  <Button size="sm" variant="ghost" aria-label={t("catalog.images.down")} disabled={i === f.images.length - 1} onClick={() => moveImg(i, 1)}>{t("catalog.images.downLabel")}</Button>
                  <Button size="sm" variant="ghost" aria-label={t("catalog.images.removeAria")} onClick={() => setF((s) => ({ ...s, images: s.images.filter((_, j) => j !== i) }))}>{t("catalog.variants.remove")}</Button>
                </li>
              ))}
              {f.images.length === 0 && <li className="text-sm text-muted">{t("catalog.images.empty")}</li>}
            </ul>
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-60 flex-1"><TextField label={t("catalog.images.urlLabel")} help="catalog.imageUrl" hint={t("catalog.images.urlHint")} type="url" placeholder="https://..." value={imgUrl} onChange={(e) => setImgUrl(e.target.value)} /></div>
              <Button variant="secondary" disabled={!/^https?:\/\//.test(imgUrl)} onClick={() => { setF((s) => ({ ...s, images: [...s.images, { url: imgUrl, alt: "" }] })); setImgUrl(""); }}>{t("catalog.images.urlAdd")}</Button>
              <input ref={file} type="file" accept={MEDIA_ACCEPT} className="sr-only" aria-label={t("catalog.images.uploadAria")} onChange={(e) => upload(e.target.files)} />
              <Button variant="secondary" loading={uploading} onClick={() => file.current?.click()}>{t("catalog.images.upload")}</Button>
            </div>
          </Card>
          <Card testId="product-seo-card" title={t("catalog.product.card.seo")}>
            <SeoFields type="product" id={id} value={f} onChange={(p) => setF((s) => ({ ...s, ...p } as PForm))} withMedia withCanonical
              fallbackTitle={f.name} fallbackDescription={f.description.replace(/\s+/g, " ").trim()} path={`/product/${f.slug}`} fallbackImage={firstImg}>
              <SlugField required value={f.slug} onChange={(v) => { setSlugTouched(true); setF((s) => ({ ...s, slug: slugify(v) })); }} origin={location.origin} pathPrefix="/product/" original={q.data?.slug} />
              <div className="grid gap-5 lg:grid-cols-2">
                <div><p className="mb-2 flex items-center gap-1 text-[13px] font-medium">{t("catalog.product.seoChecklist")}<HelpTip id="catalog.seoChecklist" /></p>
                  <SeoChecklist checks={checks} /></div>
                <div><p className="mb-2 flex items-center gap-1 text-[13px] font-medium"><Term id="jsonld">{t("catalog.product.jsonld.title")}</Term><HelpTip id="catalog.jsonld" /></p>
                  <ul className="list-inside list-disc space-y-1 text-xs text-muted">
                    <li>{t("catalog.product.jsonld.l1")}</li>
                    <li>{t("catalog.product.jsonld.l2")}</li>
                    <li>{t("catalog.product.jsonld.l3")}</li>
                  </ul></div>
              </div>
            </SeoFields>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title={t("catalog.product.card.organisation")}>
            <div className="space-y-4">
              <SelectField label={t("catalog.product.status.label")} help="catalog.productStatus" hint={t(`catalog.product.status.${f.status}`)} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Product["status"] })}>{(["draft", "active", "archived"] as const).map((s) => <option key={s} value={s}>{enumLabel("productStatus", s)}</option>)}</SelectField>
              <SelectField label={t("catalog.product.category.label")} help="catalog.categoryPick" hint={t("catalog.product.category.hint")} value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}><option value="">{t("common.none")}</option>{cats.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</SelectField>
            </div>
          </Card>
        </div>
      </div>
    </form>
      <ConfirmDialog open={archiveAsk} danger title={t("catalog.product.archive.title")} message={t("catalog.product.archive.message", { name: f.name })} confirmLabel={t("catalog.product.archive.action")} loading={save.isPending} onConfirm={() => save.mutate()} onClose={() => setArchiveAsk(false)} />
      <Modal open={!!adjust} onClose={() => setAdjust(null)} title={t("catalog.adjust.title", { sku: adjust?.sku ?? "" })}
        footer={<><Button variant="ghost" onClick={() => setAdjust(null)}>{t("common.cancel")}</Button><Button loading={doAdjust.isPending} disabled={!/^-?\d+$/.test(adj.delta) || !adj.reason.trim()} onClick={() => doAdjust.mutate()}>{t("common.apply")}</Button></>}>
        <div className="space-y-3">
          <TextField label={t("catalog.adjust.delta.label")} help="catalog.stockChange" hint={t("catalog.adjust.delta.hint")} inputMode="numeric" placeholder={t("catalog.adjust.delta.placeholder")} value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} />
          <TextField label={t("catalog.adjust.reason.label")} help="catalog.stockReason" hint={t("catalog.adjust.reason.hint")} placeholder={t("catalog.adjust.reason.placeholder")} value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })} />
          {adjDelta !== null && <p data-testid="adjust-preview" className="rounded-lg bg-canvas p-2.5 text-xs">{t("catalog.adjust.preview", { from: adjFrom, to: adjFrom + adjDelta })}{adjFrom + adjDelta < 0 && <span className="mt-1 block text-warn">{t("catalog.adjust.negative")}</span>}</p>}
          <p className="text-xs text-muted"><TermText text={t("catalog.adjust.consequence")} /></p>
        </div>
      </Modal>
    </>
  );
}
