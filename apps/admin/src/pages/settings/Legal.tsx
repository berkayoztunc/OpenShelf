import { useState } from "react";
import { useGroupForm } from "../../lib/settings";
import { Button, Card, ConfirmDialog, Tabs, TextArea } from "../../components/ui";
import { useT } from "../../i18n";
import { SettingsForm } from "./SaveBar";
import { TermStrip } from "./TermStrip";

type Key = "kvkk" | "distanceSales" | "returns" | "cookies" | "privacy";

/** Starter templates only; have them reviewed by legal counsel before publishing. */
export const TEMPLATES: Record<Key, { tr: string; en: string }> = {
  kvkk: {
    tr: "# KVKK Aydınlatma Metni\n\n{storeName} (\"Veri Sorumlusu\") olarak kişisel verilerinizi 6698 sayılı KVKK kapsamında işliyoruz.\n\n- İşlenen veriler: kimlik, iletişim, adres, sipariş ve işlem bilgileri\n- Amaç: siparişin ifası, faturalama, müşteri hizmetleri, yasal yükümlülükler\n- Haklarınız: KVKK m.11 uyarınca erişim, düzeltme, silme ve itiraz hakkı\n\nBaşvuru: {contactEmail}",
    en: "# Personal Data Notice (KVKK)\n\n{storeName} (\"Data Controller\") processes your personal data under Law No. 6698.\n\n- Data processed: identity, contact, address, order and transaction data\n- Purpose: order fulfilment, invoicing, customer service, legal obligations\n- Your rights: access, rectification, erasure and objection under Art. 11\n\nContact: {contactEmail}",
  },
  distanceSales: {
    tr: "# Mesafeli Satış Sözleşmesi\n\n**Satıcı:** {storeName}, Vergi No: {taxId}, Adres: {address}\n\n1. Konu: Alıcının satıcıdan sipariş ettiği ürünlerin satışı ve teslimi.\n2. Fiyat ve ödeme: Sipariş özetindeki tutar geçerlidir.\n3. Teslimat: Siparişten itibaren 30 gün içinde.\n4. Cayma hakkı: Teslimden itibaren 14 gün.",
    en: "# Distance Sales Agreement\n\n**Seller:** {storeName}, Tax ID: {taxId}, Address: {address}\n\n1. Subject: Sale and delivery of the products ordered by the buyer.\n2. Price and payment: the amount on the order summary applies.\n3. Delivery: within 30 days of the order.\n4. Right of withdrawal: 14 days from delivery.",
  },
  returns: {
    tr: "# İade ve Değişim Koşulları\n\nTeslimden itibaren 14 gün içinde kullanılmamış ürünleri iade edebilirsiniz. İade için {contactEmail} adresine yazın. Bedel iadesi, ürünün tarafımıza ulaşmasından sonra 14 gün içinde yapılır.",
    en: "# Returns & Exchanges\n\nUnused products can be returned within 14 days of delivery. Write to {contactEmail} to start a return. Refunds are issued within 14 days after we receive the item.",
  },
  cookies: {
    tr: "# Çerez Politikası\n\nZorunlu çerezler site işleyişi için gereklidir. Analitik ve pazarlama çerezleri yalnızca onayınızla kullanılır; tercihlerinizi çerez bannerından değiştirebilirsiniz.",
    en: "# Cookie Policy\n\nNecessary cookies are required for the site to function. Analytics and marketing cookies are used only with your consent; you can change your choice from the cookie banner.",
  },
  privacy: {
    tr: "# Gizlilik Politikası\n\n{storeName} kişisel verilerinizi yalnızca hizmet sunmak için kullanır ve üçüncü taraflarla yalnızca ödeme, kargo ve fatura süreçleri için paylaşır.",
    en: "# Privacy Policy\n\n{storeName} uses your personal data only to provide the service and shares it with third parties only for payment, shipping and invoicing.",
  },
};

export default function Legal() {
  const { t } = useT();
  const { query, draft, patch, save, dirty } = useGroupForm("legal");
  const [key, setKey] = useState<Key>("kvkk");
  const [tpl, setTpl] = useState<"tr" | "en" | null>(null);
  const KEYS: Key[] = ["kvkk", "distanceSales", "returns", "cookies", "privacy"];
  const title = (k: Key) => t(`settings.legal.doc.${k}`);
  // Inserting a template replaces the document; only ask when there is text that would be lost.
  const insert = (lang: "tr" | "en") => { if (draft && draft[key].trim() && draft[key] !== TEMPLATES[key][lang]) setTpl(lang); else patch({ [key]: TEMPLATES[key][lang] }); };
  return (
    <SettingsForm query={query} ready={!!draft} onSave={() => save.mutate()} saving={save.isPending} dirty={dirty}>
      {draft && <Card title={t("settings.legal.card.title")} actions={
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => insert("tr")}>{t("settings.legal.insertTr")}</Button>
          <Button size="sm" variant="secondary" onClick={() => insert("en")}>{t("settings.legal.insertEn")}</Button>
        </div>}>
        <TermStrip ids={["kvkk", "distancesales", "consent"]} />
        <Tabs<Key> label={t("settings.legal.tabs.label")} value={key} onChange={setKey} tabs={KEYS.map((k) => ({ id: k, label: title(k) }))} />
        <TextArea label={t("settings.legal.text.label", { doc: title(key) })} help={`settings.legal.${key}`} guide={key === "kvkk" || key === "returns" || key === "cookies" ? undefined : "store-settings#yasal-metinler"} className="min-h-80 font-mono" value={draft[key]} onChange={(e) => patch({ [key]: e.target.value })}
          hint={t("settings.legal.text.hint")} />
        <ConfirmDialog open={tpl !== null} danger title={t("settings.legal.confirmTemplate.title")} message={t("settings.legal.confirmTemplate.message")} confirmLabel={t("settings.legal.confirmTemplate.action")}
          onConfirm={() => { if (tpl) patch({ [key]: TEMPLATES[key][tpl] }); setTpl(null); }} onClose={() => setTpl(null)} />
      </Card>}
    </SettingsForm>
  );
}
