<div align="center">

# OpenShelf

**Mağazanız. Altyapınız. Özgürlüğünüz.**

Tek bir Cloudflare Worker ve D1 üzerinde çalışan, açık kaynak, tek mağazalı e-ticaret altyapısı.

[English](README.md) · [Türkçe](README.tr.md)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6.svg)](https://www.typescriptlang.org/)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-f38020.svg)](https://workers.cloudflare.com/)
[![Durum: erken geliştirme](https://img.shields.io/badge/durum-erken%20geli%C5%9Ftirme-orange.svg)](#yol-haritası)

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/<ORG>/openshelf)

</div>

> **Deploy butonu hakkında.** Buton yalnızca depo **GitHub'da herkese açık (public)** ise çalışır. Buton adresindeki `<ORG>` yerine kendi GitHub organizasyonunuzu veya kullanıcı adınızı yazın (örneğin fork'unuzun sahibi). Ayrıntılar [Hızlı başlangıç](#hızlı-başlangıç) bölümünde.

<!-- Ekran görüntüleri: henüz yok. Vitrin, yönetim paneli, Mock Inbox ve bildirim şablonu görselleri hazır olunca buraya eklenecek. -->

## OpenShelf nedir

Küçük bir işletme; katalog, müşteri ve sipariş verilerini merkezi bir platforma teslim etmeden gerçek bir mağaza işletebilmeli. OpenShelf **kendi Cloudflare hesabınıza** tek bir Worker olarak kurulur: vitrin (`/`), yönetim paneli (`/admin/`) ve API (`/api/*`, `/webhooks/*`, `/media/*`, `/feeds/*`) aynı yerden sunulur. Veriler kendi D1 veritabanınızda durur. Her kurulumda tek mağaza vardır.

Durum: erken geliştirme (v0.1). Nelerin doğrulandığı için [Entegrasyonlar](#entegrasyonlar) bölümüne bakın.

## Özellikler

- **Katalog**: ürünler, varyantlar, kategoriler, medya, kuponlar, müşteriler.
- **Stok defteri**: yalnızca eklemeli stok hareketleri; ödeme sırasında işlem bazlı rezervasyon (eşzamanlı alışverişte fazla satış olmaz).
- **Barındırılan ödeme sayfası**: kart bilgisi OpenShelf'e hiç uğramaz; fiyat sunucuda hesaplanır; ödeme, doğrulanmış webhook ve sunucudan sunucuya yeniden sorgu ile onaylanır.
- **Kanallar**: kendi vitriniz ve outbox üzerinden Trendyol pazaryeri senkronu.
- **Yönetim ayarları**: mağaza adı, logo, banner, marka renkleri, SEO, yasal metinler, ödeme kuralları, takip, bildirimler, entegrasyonlar.
- **Güvenlik**: PBKDF2 parola özeti, isteğe bağlı TOTP MFA, `__Host-` oturum çerezi, CSRF + Origin kontrolü, rol tabanlı yetki, denetim kaydı, AES-256-GCM ile şifrelenmiş entegrasyon sırları, sabit dış istek (host) izin listesi, hız sınırları, isteğe bağlı Turnstile. Bkz. [docs/security.tr.md](docs/security.tr.md).
- **Analitik**: GA4 ve Meta Pixel/Conversions API; consent mode ve tarayıcı/sunucu tekilleştirmesi için ortak `event_id`. Bkz. [docs/tracking.tr.md](docs/tracking.tr.md).
- **Bildirimler**: işlemsel SMS (Netgsm, Twilio) ve e-posta (Cloudflare Email Service), düzenlenebilir TR/EN şablonlar. Bkz. [docs/notifications.tr.md](docs/notifications.tr.md).
- **Mock Modu**: gerçek sağlayıcı hesabı olmadan tüm mağazayı deneyin. Bkz. [docs/mock-mode.tr.md](docs/mock-mode.tr.md).

### Entegrasyonlar

Tüm adaptörler satıcı dokümanlarına göre yazılmış, mock ve contract testlerle kapsanmıştır. **Hiçbiri henüz canlı hesapla doğrulanmadı.** Önce her sağlayıcının sandbox ortamını kullanın.

| Entegrasyon | Tür | Doküman | Durum |
|---|---|---|---|
| iyzico | Ödeme (barındırılan form) | [iyzico](docs/integrations/iyzico.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Geliver | Kargo | [Geliver](docs/integrations/geliver.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Trendyol Pazaryeri | Pazaryeri senkronu | [Trendyol](docs/integrations/trendyol.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Trendyol e-Faturam | Fatura | [e-Faturam](docs/integrations/efaturam.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Google Analytics 4 | Analitik | [GA4](docs/integrations/ga4.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Meta Pixel / CAPI | Reklam | [Meta](docs/integrations/meta.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Netgsm | SMS | [Netgsm](docs/integrations/netgsm.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Twilio | SMS | [Twilio](docs/integrations/twilio.tr.md) | Uygulandı, canlıda DOĞRULANMADI |
| Cloudflare Email Service | E-posta | [Cloudflare E-posta](docs/integrations/cloudflare-email.tr.md) | Uygulandı, canlıda DOĞRULANMADI. **Beta**: herhangi bir alıcıya göndermek için Workers Paid gerekir; Free planda yalnızca doğrulanmış adreslere gönderilir |

## Hızlı başlangıç

Üç yol var, en kolayından başlayarak.

### 1. Deploy to Cloudflare butonu

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/<ORG>/openshelf)

Gereksinim: depo **GitHub'da public** olmalı ve yukarıdaki adreste `<ORG>` yerine kendi GitHub organizasyonunuzu/kullanıcı adınızı yazmış olmalısınız.

Buton şunları yapar:

1. Depoyu GitHub hesabınıza kopyalar ve Workers Builds'e bağlar.
2. [`wrangler.jsonc`](wrangler.jsonc) içindeki `DB` bağlamasından **D1 veritabanını otomatik oluşturur** (kopyalanacak kimlik yok).
3. İki sır (ve bir isteğe bağlı alan) ister:

   | Alan | Değer |
   |---|---|
   | `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` |
   | `SETUP_TOKEN` | `openssl rand -hex 24` (bir yere not edin) |
   | `TURNSTILE_SECRET` | isteğe bağlı, boş bırakın |

4. Derler (`pnpm build`) ve deploy betiğini çalıştırır (`pnpm run deploy` = D1 migration'larını uygula, sonra `wrangler deploy`).
5. **Tek bir Worker** yayınlar: vitrin `/`, yönetim paneli `/admin/`, API `/api/*` altında. Sonraki her push yeniden yayınlanır.

İlk açılış:

1. `https://<worker-adresiniz>.workers.dev/admin/setup` adresini açın, `SETUP_TOKEN` değerini girin, sahip (owner) hesabını oluşturun (en az 12 karakterli parola) ve MFA'yı açın.
2. Ayarları doldurun (mağaza adı, logo, yasal metinler) ve **Ayarlar → Entegrasyonlar** üzerinden entegrasyonları etkinleştirin.
3. İsteğe bağlı demo: `ALLOW_MOCK` Worker değişkenini tanımlayıp Mock Modunu açın ([Mock Modu](#mock-modu)).

### 2. Rehberli CLI

```bash
pnpm install
node tooling/setup/setup.mjs --dry-run   # planlanan komutları gösterir, bir şey değiştirmez
pnpm run setup                           # giriş, D1, derleme, migration, deploy, sırlar
```

Tekrar çalıştırılabilir (idempotent). (`pnpm run setup` kullanın: yalın `pnpm setup` pnpm'in kendi komutudur.) Bayraklar: `--yes`, `--enable-r2`, `--skip-deploy`, `--domain=https://shop.example.com`, `--db-name=AD`, `--local`, `--dry-run`, `--mock`. Tam rehber: [docs/deploy-cloudflare.tr.md](docs/deploy-cloudflare.tr.md).

### 3. Yerel geliştirme

Gereksinimler: Node >= 20, pnpm.

```bash
pnpm install
pnpm setup:local            # .dev.vars + workers/api/.dev.vars yazar, yerel D1'e migration uygular
pnpm seed                   # isteğe bağlı demo mağaza (12 ürün, 2 kupon)
pnpm dev                    # vitrin :5173, yönetim :5174/admin/, API :8787
```

`http://localhost:5174/admin/setup` adresini açın ve `workers/api/.dev.vars` içindeki `SETUP_TOKEN` değerini kullanın. Gerçek tek-Worker düzenini görmek için: `pnpm dev:site`. Daha fazlası: [docs/quickstart.tr.md](docs/quickstart.tr.md).

`npx create-openshelf@latest` yol haritasındadır, bugün çalışan bir komut değildir.

## Mock Modu

Mock Modu, tüm dış sağlayıcıları çevrimdışı birer taklitle değiştirir; böylece hiçbir hesap açmadan demo yapabilir veya geliştirebilirsiniz.

- Ödeme adımı, Başarılı / Başarısız / İptal düğmeleri olan sahte bir ödeme sayfasına (`/mock/pay/...`) yönlenir.
- SMS, e-posta, fatura, kargo etiketi ve analitik olayları gönderilmez; **Mock Inbox**'a (yönetim kenar çubuğu) yazılır.
- Hiçbir gerçek sağlayıcıya istek gitmez.

Açmak için: yayındaki Worker'da `ALLOW_MOCK` değişkenini tanımlayın (Dashboard → Worker → Settings → Variables veya `wrangler.jsonc` içindeki `vars`; yerel geliştirme örneğinde zaten tanımlıdır), ardından bir **owner** kullanıcı **Ayarlar → Sistem → Mock modu** anahtarını açar.

Güvenlik kuralları (hedeflenen davranış):

- Yayındaki Worker, `ALLOW_MOCK` tanımlı değilse Mock Modunun açılmasını reddeder.
- Mock ve gerçek birbirini dışlar: gerçek bir ödeme sağlayıcısı etkinken veya gerçek ödenmiş siparişler varken açılamaz. Mock ödemeler işaretlenir (`payments.is_mock`).
- Mock inbox 7 gün / 2000 satır tutulur. Yalnızca owner açıp kapatabilir veya temizleyebilir. Gerçek siparişten önce kapatın.

Demo turu: `pnpm seed`, Mock Modunu açın, vitrinde bir ürünü sepete ekleyip ödemeye geçin, sahte ödeme sayfasında **Başarılı**'ya basın; ardından yönetimde sipariş `paid` olur ve Mock Inbox'ta onay SMS'i/e-postası görünür. Tam rehber: [docs/mock-mode.tr.md](docs/mock-mode.tr.md).

## Bildirimler

Yalnızca işlemsel mesajlar (pazarlama yok). Altı olay: `order_paid`, `order_shipped`, `order_delivered`, `order_cancelled`, `order_refunded`, `admin_new_order`. Her olay SMS, e-posta veya ikisiyle gönderilebilir. Şablonlar dil başına (TR/EN) düzenlenir ve `{{orderNumber}}` gibi değişkenler kullanır. Önlemler: SMS alıcıları ülke kodu izin listesiyle sınırlıdır (varsayılan `+90`), alıcı başına günlük üst sınır vardır, test gönderimleri hız sınırına tabidir. **Ayarlar → Bildirimler** ekranından test gönderebilirsiniz. Rehber: [docs/notifications.tr.md](docs/notifications.tr.md).

## Yapılandırma referansı

| Ad | Tür | Zorunlu | Amaç |
|---|---|---|---|
| `APP_ENCRYPTION_KEY` | sır | evet | 32 rastgele baytın base64 hali; D1'deki entegrasyon bilgilerini şifreler |
| `SETUP_TOKEN` | sır | evet (ilk açılış) | `/admin/setup` için tek kullanımlık token |
| `TURNSTILE_SECRET` | sır | hayır | ödeme/giriş için Turnstile bot koruması |
| `ALLOW_MOCK` | değişken | hayır | yayındaki Worker'da Mock Modunu mümkün kılmak için tanımlanmalı |
| `STOREFRONT_ORIGIN`, `ADMIN_ORIGIN`, `API_ORIGIN` | değişkenler | hayır | varsayılan olarak istek origin'i kullanılır; üretimde sıkı izin listesi için tam `https://` origin'lerini sabitleyin |
| `MEDIA` (R2 bucket) | bağlama | hayır | isteğe bağlı ücretli eklenti; yoksa medya D1'de saklanır |

Entegrasyon API anahtarları Worker sırrı değildir: **Ayarlar → Entegrasyonlar** ekranına girin (şifreli saklanır).

## Mimari

```
 Tarayıcı ──► Cloudflare Worker (Hono) ◄──► D1 (SQLite)
               ├─ /            vitrin (statik dosyalar)
               ├─ /admin/      yönetim paneli (statik dosyalar)
               ├─ /api/*  /webhooks/*  /media/*  /feeds/*  /mock/*
               └─ scheduled(): her dakika cron
                     │
                     ▼
               outbox işleri ──► ödeme, kargo, fatura, pazaryeri,
                                 analitik, SMS, e-posta adaptörleri
               isteğe bağlı: R2 (medya)
```

Ayrıntılar: [docs/architecture.tr.md](docs/architecture.tr.md).

## Ücretsiz katman hakkında dürüst not

Çekirdek (Worker + D1 + statik dosyalar), küçük bir mağaza için Cloudflare ücretsiz planlarına sığacak şekilde tasarlanmıştır. Bu bir hedeftir, taahhüt değildir.

- Limitleri ve faturalandırmayı Cloudflare belirler ve değiştirebilir; OpenShelf'in ücretsiz olduğunu ya da ücretsiz kalacağını iddia etmiyoruz.
- Trafik, katalog büyüklüğü ve sipariş hacmi ücretsiz limitleri aşabilir (istek/CPU, D1 okuma/yazma/depolama).
- R2 ve Queues isteğe bağlıdır ve ödeme yöntemi gerektirebilir. Cloudflare e-posta gönderimi Beta'dır; herhangi bir alıcıya göndermek için Workers Paid gerekir. SMS sağlayıcıları mesaj başına ücret alır.
- Ödeme, kargo, fatura ve pazaryeri servislerinin kendi ücretleri vardır.

Güncel limitler: [Workers](https://developers.cloudflare.com/workers/platform/limits/), [D1](https://developers.cloudflare.com/d1/platform/limits/).

## Güvenlik

Özet [docs/security.tr.md](docs/security.tr.md) içinde; açıkları [SECURITY.md](SECURITY.md) uyarınca özel olarak bildirin. Üretimde origin değişkenlerini sabitleyin ve Mock Modunu kapalı tutun.

## Proje yapısı

```
apps/storefront     herkese açık mağaza (React + Vite)
apps/admin          yönetim paneli (React + Vite, /admin/ altında sunulur)
workers/api         Hono API, webhook'lar, cron (outbox çalıştırıcı), D1 migration'ları
packages/           core, db, shared, ui, integration-sdk, integrations/*
tooling/setup       rehberli Cloudflare kurulumu
tooling/seed        demo verisi
tooling/deploy      tek Worker için dist-site/ klasörünü hazırlar
docs/               rehberler (her birinin .tr.md karşılığı var)
wrangler.jsonc      tek-Worker için ana yapılandırma
```

## Komutlar

| Komut | Ne yapar |
|---|---|
| `pnpm dev` | API + vitrin + yönetim geliştirme sunucuları |
| `pnpm dev:site` | derler, ardından wrangler ile tek-Worker önizlemesi |
| `pnpm build` | her şeyi derler ve `dist-site/` klasörünü hazırlar |
| `pnpm run deploy` | uzak D1 migration'larını uygular, sonra `wrangler deploy` |
| `pnpm run setup` / `pnpm setup:local` | rehberli yayın / yerel kurulum |
| `pnpm seed` | yerel D1'e demo veri yükler |
| `pnpm db:generate` / `pnpm db:migrate:local` | migration üretir / uygular |
| `pnpm typecheck` / `lint` / `test` / `format` | kalite kontrolleri |

## Yol haritası

- `create-openshelf` CLI (`npx create-openshelf@latest`)
- Outbox için Queues adaptörü
- Daha fazla sağlayıcı (ödeme, kargo, SMS, e-posta)
- Mevcut entegrasyonların canlı hesaplarla doğrulanması

## Katkı ve lisans

[CONTRIBUTING.md](CONTRIBUTING.md) ve [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) dosyalarına bakın. MIT lisanslıdır ([LICENSE](LICENSE)). Şablonlar ve dokümanlar hukuki veya vergisel danışmanlık değildir.
