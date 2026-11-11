import { DEPLOY_URL, genEncryptionKey, genSetupToken, normalizeOrigin } from "./keys.js";

const REPO = "berkayoztunc/OpenShelf";
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ---------- i18n ---------- */
const T = {
  en: {
    "meta.title": "OpenShelf: your online store on Cloudflare",
    "nav.docs": "Docs", "nav.github": "GitHub", "nav.integ": "Integrations",
    "hero.c1": "MIT licensed", "hero.c2": "Cloudflare Workers + D1", "hero.c3": "Turkish & English",
    "steps.eyebrow": "Setup", "next.eyebrow": "First hour", "feat.eyebrow": "Included",
    "integ.eyebrow": "Before you sell", "integ.title": "Connect your providers",
    "integ.sub": "OpenShelf does not charge cards, carry parcels or issue invoices itself. It connects to the companies that do. Until you connect them the shop runs in Mock Mode and nothing real is charged or sent. To take real orders you need to complete these steps with each provider you plan to use.",
    "how1.t": "Open an account", "how1.b": "Sign up with the provider and finish their approval (merchant agreement, sender name, seller account). Approval can take days, so start early.",
    "how2.t": "Get your API keys", "how2.b": "Copy the keys from the provider's panel. Where a sandbox or test mode exists, start with those keys.",
    "how3.t": "Enter them in the admin", "how3.b": "Admin → Settings → Integrations: pick the provider, paste the keys and run the connection test. Keys are stored encrypted.",
    "integ.core": "Core", "integ.opt": "Optional", "integ.go": "Go to {n}", "integ.guide": "Setup guide",
    "integ.note": "Contracts, fees and approvals are between you and each provider. The OpenShelf adapters are built from vendor documentation and have not been verified against live accounts yet: test with sandbox keys and one small real order before you launch.",
    "c.pay": "Payments", "c.ship": "Shipping", "c.inv": "e-Invoice", "c.market": "Marketplace", "c.sms": "SMS", "c.mail": "E-mail", "c.track": "Analytics & ads",
    "i.iyzico.d": "Card payments on iyzico's hosted checkout page, with refunds from the order page.", "i.iyzico.n": "Apply for an iyzico merchant account, then copy the API key and Secret key (sandbox first, production after a test order).",
    "i.geliver.d": "Carrier price quotes, shipping labels and tracking from the order page.", "i.geliver.n": "Create a Geliver account, generate an API token and fill in your sender address under Settings → General.",
    "i.efaturam.d": "e-Fatura / e-Arşiv invoices for orders, issued automatically or from the order page.", "i.efaturam.n": "Sign up with e-Faturam, confirm in writing which order sources your contract covers, then enter the credentials they give you.",
    "i.trendyol.d": "Mirrors your Trendyol orders and pushes stock and prices to the marketplace.", "i.trendyol.n": "In the Trendyol seller panel copy your Seller ID, API key and API secret, then map your products.",
    "i.netgsm.d": "Order SMS to customers in Turkey.", "i.netgsm.n": "Open a Netgsm account, get your sender header approved and create an API sub-user.",
    "i.twilio.d": "Order SMS to numbers outside Turkey.", "i.twilio.n": "Create a Twilio account, register a sender, then copy the Account SID and Auth Token.",
    "i.cfemail.d": "Order e-mails from your own domain through Cloudflare Email Sending (beta).", "i.cfemail.n": "Add your domain to Email Sending, verify its DNS records and create an API token. Sending to any recipient needs the Workers Paid plan.",
    "i.ga4.d": "Visitor analytics with Consent Mode, plus server-side purchase events.", "i.ga4.n": "Create a GA4 property, copy the Measurement ID and create a Measurement Protocol API secret.",
    "i.meta.d": "Meta Pixel and Conversions API for ads, plus a product catalog feed.", "i.meta.n": "In Events Manager create a Pixel, copy its ID and generate a Conversions API access token.",
    "hero.badge": "Open source · runs on your own Cloudflare account",
    "hero.title": "Your online store, live in 5 minutes.",
    "hero.sub": "OpenShelf is a complete shop (storefront, admin panel, orders, stock, invoices, SMS/e-mail, Trendyol & shipping) that deploys to Cloudflare. No servers to manage, and AI assistants can run it for you.",
    "hero.cta": "Start the 3-step setup", "hero.docs": "Read the docs",
    "steps.title": "Deploy in 3 steps",
    "s1.title": "Generate your secrets", "s1.body": "Two secrets protect your store. They are created here in your browser and never sent anywhere. Keep them: the key encrypts your integration credentials and cannot be recovered.",
    "s1.key": "APP_ENCRYPTION_KEY", "s1.token": "SETUP_TOKEN", "s1.keyHint": "Encrypts API keys stored in your shop. Paste into the deploy form.", "s1.tokenHint": "One-time password to create your admin account in step 3.",
    "s1.copy": "Copy", "s1.copied": "Copied", "s1.regen": "Generate new", "s1.download": "Download as .txt", "s1.saved": "I saved both values somewhere safe (password manager)",
    "s2.title": "Deploy to Cloudflare", "s2.body": "Free Cloudflare account needed. Click the button, sign in, connect GitHub, and paste the two secrets from step 1 into the form. Cloudflare creates the database and deploys everything.",
    "s2.btn": "Deploy to Cloudflare", "s2.locked": "Tick the box in step 1 first", "s2.note": "Leave TURNSTILE_SECRET empty. It takes about 2-3 minutes; you will get a https://…workers.dev address.",
    "s3.title": "Create your admin account", "s3.body": "Paste your new shop address, then open the setup page. Enter the SETUP_TOKEN from step 1, create the owner account and turn on 2-step verification.",
    "s3.placeholder": "my-shop.openshelf.workers.dev", "s3.open": "Open setup page", "s3.check": "Check my deployment", "s3.bad": "Enter the address Cloudflare gave you (…workers.dev)",
    "chk.ok": "Online", "chk.fail": "Cannot reach it yet. It may still be deploying, or the address is wrong.", "chk.key": "Encryption key", "chk.token": "Setup token", "chk.setup": "Admin account",
    "chk.keyok": "valid", "chk.missing": "missing: add it in Cloudflare → Workers → your worker → Settings → Variables and Secrets", "chk.invalid": "invalid: must be base64 of 32 bytes (use the generator above)",
    "chk.setupneeded": "not created yet: open the setup page", "chk.setupdone": "created: log in at /admin", "chk.set": "set",
    "next.title": "After you log in", "next.sub": "A suggested order for your first hour.",
    "n1": "Settings → General: store name, contact, tax rate.", "n2": "Add your first products (or import a CSV).", "n3": "Not ready for real providers? Turn on Mock Mode to try orders, payments, SMS and e-mail safely.",
    "n4": "Integrations: iyzico for payments, Netgsm/Twilio for SMS, e-invoice, Trendyol, Geliver shipping.", "n5": "Settings → MCP: create a token and let an AI assistant manage the store.", "n6": "Add your own domain in Cloudflare (Workers → Domains).",
    "feat.title": "What you get",
    "f1.t": "Storefront + admin", "f1.b": "Fast, SEO-ready shop in Turkish and English with a full admin panel.", "f2.t": "Orders, stock, invoices", "f2.b": "Local stock is the truth; e-invoice, shipping labels and notifications built in.",
    "f3.t": "Trendyol & Geliver", "f3.b": "Mirror marketplace orders, push stock, print cargo slips, buy shipping labels.", "f4.t": "Campaigns & SMS", "f4.b": "E-mail/SMS campaigns to customers with marketing consent, with unsubscribe.",
    "f5.t": "AI-managed (MCP)", "f5.b": "Connect Claude or any MCP client: ask questions, fix SEO, manage products, with permissions you control.", "f6.t": "Cheap & yours", "f6.b": "Runs on Cloudflare's free tier for small shops. Your data stays in your account.",
    "ai.title": "Connect an AI assistant", "ai.body": "After setup: Settings → MCP / AI access → create a token, then run:", "ai.url": "your shop address",
    "help.title": "Need a different way?", "help.cli": "Command line: git clone, then `pnpm run setup` (creates everything and generates secrets for you).", "help.docs": "Full deployment guide", "help.sec": "Security & privacy", "help.issue": "Report a problem",
    "foot": "OpenShelf is open source (MIT). Not affiliated with Cloudflare.",
  },
  tr: {
    "meta.title": "OpenShelf: Cloudflare üzerinde online mağazanız",
    "nav.docs": "Dokümantasyon", "nav.github": "GitHub", "nav.integ": "Entegrasyonlar",
    "hero.c1": "MIT lisanslı", "hero.c2": "Cloudflare Workers + D1", "hero.c3": "Türkçe ve İngilizce",
    "steps.eyebrow": "Kurulum", "next.eyebrow": "İlk saat", "feat.eyebrow": "Dahil olanlar",
    "integ.eyebrow": "Satışa başlamadan önce", "integ.title": "Entegrasyon firmalarını bağlayın",
    "integ.sub": "OpenShelf karttan ödeme çekmez, kargo taşımaz, fatura kesmez; bu işleri yapan firmalara bağlanır. Onları bağlayana kadar mağaza Deneme Modu'nda çalışır, gerçek ödeme alınmaz ve hiçbir şey gönderilmez. Gerçek sipariş almak için kullanacağınız her firmada aşağıdaki adımları tamamlamanız gerekir.",
    "how1.t": "Hesap açın", "how1.b": "Firmaya başvurun ve onay sürecini tamamlayın (üye işyeri sözleşmesi, gönderici başlığı, satıcı hesabı). Onay günler sürebilir, erken başlayın.",
    "how2.t": "API anahtarlarınızı alın", "how2.b": "Anahtarları firmanın panelinden kopyalayın. Sandbox ya da test modu varsa önce o anahtarlarla başlayın.",
    "how3.t": "Yönetim paneline girin", "how3.b": "Yönetim → Ayarlar → Entegrasyonlar: firmayı seçin, anahtarları yapıştırın ve bağlantı testini çalıştırın. Anahtarlar şifreli saklanır.",
    "integ.core": "Temel", "integ.opt": "İsteğe bağlı", "integ.go": "{n} sitesine git", "integ.guide": "Kurulum rehberi",
    "integ.note": "Sözleşme, ücret ve onay süreçleri sizinle ilgili firma arasındadır. OpenShelf bağlantıları firmaların dokümanlarına göre yazıldı ve henüz canlı hesaplarla doğrulanmadı: yayına çıkmadan önce sandbox anahtarlarıyla ve küçük bir gerçek siparişle deneyin.",
    "c.pay": "Ödeme", "c.ship": "Kargo", "c.inv": "e-Fatura", "c.market": "Pazaryeri", "c.sms": "SMS", "c.mail": "E-posta", "c.track": "Analitik ve reklam",
    "i.iyzico.d": "iyzico'nun ödeme sayfasında kartla ödeme; iade sipariş sayfasından yapılır.", "i.iyzico.n": "iyzico üye işyeri başvurusu yapın, ardından API anahtarını ve Gizli anahtarı kopyalayın (önce sandbox, test siparişinden sonra canlı).",
    "i.geliver.d": "Sipariş sayfasından kargo fiyat teklifi, kargo etiketi ve takip.", "i.geliver.n": "Geliver hesabı açın, API anahtarı oluşturun ve Ayarlar → Genel bölümünde gönderici adresinizi doldurun.",
    "i.efaturam.d": "Siparişler için e-Fatura / e-Arşiv; otomatik ya da sipariş sayfasından kesilir.", "i.efaturam.n": "e-Faturam'a başvurun, sözleşmenizin hangi sipariş kaynaklarını kapsadığını yazılı olarak teyit edin, ardından size verilen bilgileri girin.",
    "i.trendyol.d": "Trendyol siparişlerinizi yansıtır, stok ve fiyatı pazaryerine gönderir.", "i.trendyol.n": "Trendyol satıcı panelinden Satıcı ID, API anahtarı ve API gizli anahtarını kopyalayın, sonra ürünlerinizi eşleştirin.",
    "i.netgsm.d": "Türkiye'deki müşterilere sipariş SMS'i.", "i.netgsm.n": "Netgsm hesabı açın, gönderici başlığınızı onaylatın ve bir API alt kullanıcısı oluşturun.",
    "i.twilio.d": "Türkiye dışındaki numaralara sipariş SMS'i.", "i.twilio.n": "Twilio hesabı açın, bir gönderici tanımlayın, ardından Account SID ve Auth Token değerlerini kopyalayın.",
    "i.cfemail.d": "Cloudflare Email Sending (beta) ile kendi alan adınızdan sipariş e-postaları.", "i.cfemail.n": "Alan adınızı Email Sending'e ekleyin, DNS kayıtlarını doğrulayın ve bir API anahtarı oluşturun. Her alıcıya gönderim için Workers Paid planı gerekir.",
    "i.ga4.d": "İzin modlu ziyaretçi analitiği ve sunucu tarafı satın alma olayları.", "i.ga4.n": "Bir GA4 mülkü oluşturun, Ölçüm Kimliği'ni kopyalayın ve bir Measurement Protocol API gizli anahtarı oluşturun.",
    "i.meta.d": "Reklamlar için Meta Pixel ve Conversions API, ayrıca ürün kataloğu beslemesi.", "i.meta.n": "Events Manager'da bir Pixel oluşturun, kimliğini kopyalayın ve bir Conversions API erişim anahtarı üretin.",
    "hero.badge": "Açık kaynak · kendi Cloudflare hesabınızda çalışır",
    "hero.title": "Online mağazanız 5 dakikada yayında.",
    "hero.sub": "OpenShelf eksiksiz bir e-ticaret sistemi (vitrin, yönetim paneli, sipariş, stok, fatura, SMS/e-posta, Trendyol ve kargo). Cloudflare'e kurulur, sunucu yönetmezsiniz ve AI asistanları mağazayı sizin yerinize yönetebilir.",
    "hero.cta": "3 adımlık kuruluma başla", "hero.docs": "Dokümanları oku",
    "steps.title": "3 adımda kurulum",
    "s1.title": "Gizli anahtarlarınızı üretin", "s1.body": "Mağazanızı iki gizli değer korur. Burada, tarayıcınızda üretilir ve hiçbir yere gönderilmez. Saklayın: anahtar entegrasyon bilgilerinizi şifreler ve geri getirilemez.",
    "s1.key": "APP_ENCRYPTION_KEY", "s1.token": "SETUP_TOKEN", "s1.keyHint": "Mağazanızda saklanan API anahtarlarını şifreler. Kurulum formuna yapıştırın.", "s1.tokenHint": "3. adımda yönetici hesabını oluşturmak için tek kullanımlık şifre.",
    "s1.copy": "Kopyala", "s1.copied": "Kopyalandı", "s1.regen": "Yenisini üret", "s1.download": ".txt olarak indir", "s1.saved": "İki değeri de güvenli bir yere kaydettim (şifre yöneticisi)",
    "s2.title": "Cloudflare'e kurun", "s2.body": "Ücretsiz bir Cloudflare hesabı yeterli. Düğmeye tıklayın, giriş yapın, GitHub'ı bağlayın ve 1. adımdaki iki değeri forma yapıştırın. Cloudflare veritabanını oluşturur ve her şeyi yayına alır.",
    "s2.btn": "Cloudflare'e kur", "s2.locked": "Önce 1. adımdaki kutuyu işaretleyin", "s2.note": "TURNSTILE_SECRET'ı boş bırakın. Yaklaşık 2-3 dakika sürer; sonunda https://…workers.dev adresiniz olur.",
    "s3.title": "Yönetici hesabınızı oluşturun", "s3.body": "Yeni mağaza adresinizi yapıştırın, kurulum sayfasını açın. 1. adımdaki SETUP_TOKEN'ı girin, sahip hesabını oluşturun ve iki adımlı doğrulamayı açın.",
    "s3.placeholder": "magazam.openshelf.workers.dev", "s3.open": "Kurulum sayfasını aç", "s3.check": "Kurulumumu kontrol et", "s3.bad": "Cloudflare'in verdiği adresi girin (…workers.dev)",
    "chk.ok": "Çevrimiçi", "chk.fail": "Henüz ulaşılamıyor. Kurulum sürüyor olabilir ya da adres yanlış.", "chk.key": "Şifreleme anahtarı", "chk.token": "Kurulum şifresi", "chk.setup": "Yönetici hesabı",
    "chk.keyok": "geçerli", "chk.missing": "eksik: Cloudflare → Workers → worker'ınız → Settings → Variables and Secrets bölümünden ekleyin", "chk.invalid": "geçersiz: 32 baytın base64'ü olmalı (yukarıdaki üreticiyi kullanın)",
    "chk.setupneeded": "henüz yok: kurulum sayfasını açın", "chk.setupdone": "oluşturuldu: /admin'den giriş yapın", "chk.set": "tanımlı",
    "next.title": "Giriş yaptıktan sonra", "next.sub": "İlk saatiniz için önerilen sıra.",
    "n1": "Ayarlar → Genel: mağaza adı, iletişim, vergi oranı.", "n2": "İlk ürünlerinizi ekleyin (ya da CSV içe aktarın).", "n3": "Gerçek sağlayıcılara hazır değil misiniz? Deneme Modu'nu açıp sipariş, ödeme, SMS ve e-postayı güvenle deneyin.",
    "n4": "Entegrasyonlar: ödeme için iyzico, SMS için Netgsm/Twilio, e-fatura, Trendyol, Geliver kargo.", "n5": "Ayarlar → MCP: anahtar oluşturup bir AI asistanının mağazayı yönetmesini sağlayın.", "n6": "Cloudflare'de kendi alan adınızı ekleyin (Workers → Domains).",
    "feat.title": "Neler var",
    "f1.t": "Vitrin + yönetim", "f1.b": "Türkçe ve İngilizce, hızlı, SEO hazır mağaza ve tam yönetim paneli.", "f2.t": "Sipariş, stok, fatura", "f2.b": "Gerçek stok sizde; e-fatura, kargo etiketi ve bildirimler hazır.",
    "f3.t": "Trendyol ve Geliver", "f3.b": "Pazaryeri siparişlerini yansıtın, stok gönderin, kargo fişi basın, kargo etiketi alın.", "f4.t": "Kampanya ve SMS", "f4.b": "Pazarlama izni olan müşterilere e-posta/SMS kampanyası, abonelikten çıkma dahil.",
    "f5.t": "AI ile yönetim (MCP)", "f5.b": "Claude veya herhangi bir MCP istemcisini bağlayın: soru sorun, SEO düzeltin, ürün yönetin; yetkiler sizde.", "f6.t": "Ucuz ve size ait", "f6.b": "Küçük mağazalar için Cloudflare'in ücretsiz katmanında çalışır. Verileriniz kendi hesabınızda.",
    "ai.title": "AI asistanı bağlayın", "ai.body": "Kurulumdan sonra: Ayarlar → MCP / AI erişimi → anahtar oluşturun, sonra çalıştırın:", "ai.url": "mağaza adresiniz",
    "help.title": "Başka bir yol mu istiyorsunuz?", "help.cli": "Komut satırı: git clone, sonra `pnpm run setup` (her şeyi oluşturur ve gizli değerleri sizin için üretir).", "help.docs": "Tam kurulum rehberi", "help.sec": "Güvenlik ve gizlilik", "help.issue": "Sorun bildir",
    "foot": "OpenShelf açık kaynaktır (MIT). Cloudflare ile bağlantısı yoktur.",
  },
};
let lang = (localStorage.getItem("os-lang") || (navigator.language || "en").slice(0, 2)) === "tr" ? "tr" : "en";
const t = (k) => T[lang][k] ?? T.en[k] ?? k;

/* ---------- integration providers (rendered here: the HTML itself links only to this repo) ---------- */
const INTEG = [
  ["iyzico", "iyzico", "c.pay", true, "https://www.iyzico.com"],
  ["geliver", "Geliver", "c.ship", true, "https://geliver.io"],
  ["efaturam", "e-Faturam", "c.inv", true, "https://trendyolefaturam.com"],
  ["trendyol", "Trendyol", "c.market", false, "https://partner.trendyol.com"],
  ["netgsm", "Netgsm", "c.sms", false, "https://www.netgsm.com.tr"],
  ["twilio", "Twilio", "c.sms", false, "https://www.twilio.com"],
  ["cfemail", "Cloudflare Email", "c.mail", false, "https://dash.cloudflare.com", "cloudflare-email"],
  ["ga4", "Google Analytics 4", "c.track", false, "https://analytics.google.com"],
  ["meta", "Meta", "c.track", false, "https://business.facebook.com/events_manager"],
];
const docUrl = (name) => `https://github.com/${REPO}/blob/main/docs/${lang === "tr" ? name.replace(/\.md$/, ".tr.md") : name}`;
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
function renderInteg() {
  $("#integ").replaceChildren(...INTEG.map(([id, name, cat, core, url, doc = id]) => {
    const card = el("article", "card"); const tags = el("div", "tags"); const acts = el("p", "acts");
    tags.append(el("span", "tag", t(cat)), el("span", core ? "tag core" : "tag", t(core ? "integ.core" : "integ.opt")));
    const go = Object.assign(el("a", "link", `${t("integ.go").replace("{n}", name)} ↗`), { href: url, target: "_blank", rel: "noopener noreferrer" });
    const guide = Object.assign(el("a", "link", t("integ.guide")), { href: docUrl(`integrations/${doc}.md`) });
    acts.append(go, guide);
    card.append(tags, el("h3", "", name), el("p", "", t(`i.${id}.d`)), el("p", "todo-line", t(`i.${id}.n`)), acts);
    return card;
  }));
}
function applyLang() {
  document.documentElement.lang = lang; document.title = t("meta.title");
  $$("[data-doc]").forEach((a) => { a.href = docUrl(a.dataset.doc); });
  renderInteg();
  $$("[data-i]").forEach((el) => { el.textContent = t(el.dataset.i); });
  $$("[data-ph]").forEach((el) => { el.placeholder = t(el.dataset.ph); });
  $$(".lang button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.lang === lang)));
  updateDeploy(); renderCmd();
}

/* ---------- step 1: secrets ---------- */
const state = { key: "", token: "" };
function gen() { state.key = genEncryptionKey(); state.token = genSetupToken(); $("#key").textContent = state.key; $("#token").textContent = state.token; $("#saved").checked = false; updateDeploy(); }
function copy(btn, text) {
  navigator.clipboard?.writeText(text).then(() => { const o = btn.textContent; btn.textContent = t("s1.copied"); setTimeout(() => { btn.textContent = o; }, 1400); });
}
$("#copy-key").addEventListener("click", (e) => copy(e.currentTarget, state.key));
$("#copy-token").addEventListener("click", (e) => copy(e.currentTarget, state.token));
$("#regen").addEventListener("click", gen);
$("#download").addEventListener("click", () => {
  const blob = new Blob([`# OpenShelf secrets: keep this file private\nAPP_ENCRYPTION_KEY=${state.key}\nSETUP_TOKEN=${state.token}\n`], { type: "text/plain" });
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "openshelf-secrets.txt" }); a.click(); URL.revokeObjectURL(a.href);
});
$("#saved").addEventListener("change", updateDeploy);

/* ---------- step 2: deploy button ---------- */
function updateDeploy() {
  const btn = $("#deploy"); const ok = $("#saved").checked;
  btn.setAttribute("aria-disabled", String(!ok)); btn.href = ok ? DEPLOY_URL(REPO) : "#";
  btn.textContent = ok ? t("s2.btn") : t("s2.locked");
}
$("#deploy").addEventListener("click", (e) => { if ($("#deploy").getAttribute("aria-disabled") === "true") e.preventDefault(); });

/* ---------- step 3: open + check ---------- */
let origin = null;
function readOrigin() { origin = normalizeOrigin($("#addr").value); $("#addr-err").hidden = !!origin || !$("#addr").value.trim(); return origin; }
$("#addr").addEventListener("input", () => { readOrigin(); renderCmd(); });
$("#open").addEventListener("click", () => { if (readOrigin()) window.open(`${origin}/admin/setup`, "_blank", "noopener"); else $("#addr-err").hidden = false; });
const row = (label, value, tone) => `<li><span>${label}</span><b class="${tone}">${value}</b></li>`;
$("#check").addEventListener("click", async () => {
  const out = $("#result"); if (!readOrigin()) { $("#addr-err").hidden = false; return; }
  out.hidden = false; out.innerHTML = "<li><span>…</span></li>";
  try {
    const r = await fetch(`${origin}/health`, { cache: "no-store" }); const h = await r.json();
    const key = h.encryptionKey === "ok" ? [t("chk.keyok"), "good"] : h.encryptionKey === "invalid" ? [t("chk.invalid"), "bad"] : [t("chk.missing"), "bad"];
    out.innerHTML = row(t("chk.ok"), "✓", "good") + row(t("chk.key"), key[0], key[1])
      + row(t("chk.token"), h.setupToken === "set" ? t("chk.set") : t("chk.missing"), h.setupToken === "set" ? "good" : (h.setup === "needed" ? "bad" : "good"))
      + row(t("chk.setup"), h.setup === "needed" ? t("chk.setupneeded") : t("chk.setupdone"), h.setup === "needed" ? "warn" : "good");
  } catch { out.innerHTML = row(t("chk.fail"), "✗", "bad"); }
});

/* ---------- AI command ---------- */
function renderCmd() { $("#cmd").textContent = `claude mcp add --transport http openshelf ${(origin || `https://<${t("ai.url")}>`)}/mcp --header "Authorization: Bearer osk_…"`; }

/* ---------- boot ---------- */
$$(".lang button").forEach((b) => b.addEventListener("click", () => { lang = b.dataset.lang; localStorage.setItem("os-lang", lang); applyLang(); }));
$("#gh").href = `https://github.com/${REPO}`;
gen(); applyLang();
