# Cloudflare'e Dağıtım

[English](deploy-cloudflare.md)

OpenShelf **tek bir Cloudflare Worker** olarak dağıtılır: vitrin `/`, yönetim paneli `/admin/`, API `/api/*` altında (ayrıca `/webhooks/*`, `/media/*`, `/feeds/*`, `/sitemap.xml`, `/robots.txt`). Statik sayfalar Workers Static Assets'ten, veri **D1**'den gelir. Her şey tek origin olduğu için CORS veya siteler arası cookie ayarı gerekmez. Kanonik yapılandırma kökteki [`wrangler.jsonc`](../wrangler.jsonc) dosyasıdır; `workers/api/wrangler.toml` yalnızca yerel, sadece-API geliştirme içindir.

> Maliyet notu: çekirdek (Workers + D1 + statik varlıklar) küçük mağazalar için Cloudflare ücretsiz planını hedefler; limitleri ve ücretlendirmeyi Cloudflare belirler ve değişebilir. R2 ve Queues isteğe bağlıdır ve ücret doğurabilir (R2 isteğe bağlı ücretli eklentidir). Cloudflare Email gönderimi ücretli/beta bir özelliktir. Güncel fiyatları kontrol edin, faturalama uyarısı kurun.

## 1. Deploy to Cloudflare butonu (en kolay)

Depo **GitHub veya GitLab'da herkese açık (public)** olmalıdır. Buton URL'si (alt dizin değil, depo kökü):

```
https://deploy.workers.cloudflare.com/?url=https://github.com/<ORG>/openshelf
```

Akış: butona tıklayın, Cloudflare'in GitHub'a erişmesine izin verin, formu inceleyin. Cloudflare depoyu hesabınıza kopyalar, `wrangler.jsonc` içindeki `DB` bağlamasından **D1 veritabanını otomatik oluşturur** (kopyalanacak ID yok) ve `.dev.vars.example` / `package.json` (`cloudflare.bindings`) içinde tanımlı secret'ları sorar:

| Form alanı | Ne girilmeli |
|---|---|
| `APP_ENCRYPTION_KEY` | `openssl rand -base64 32` (tam 32 rastgele baytın base64'ü olmalı) |
| `SETUP_TOKEN` | `openssl rand -hex 24` (not alın; `/admin/setup` sayfasında bir kez yazacaksınız) |
| `TURNSTILE_SECRET` | isteğe bağlı; boş bırakın |

Ardından derleme (`pnpm build`) ve dağıtım (`pnpm run deploy` = `wrangler d1 migrations apply DB --remote && wrangler deploy`) çalışır; veritabanı migration'ları uygulanır. Sonraki her push Workers Builds ile yeniden dağıtılır.

## 2. Rehberli CLI kurulumu

```bash
pnpm install
node tooling/setup/setup.mjs --dry-run   # planlanan komutları incele
node tooling/setup/setup.mjs
```

Tekrar çalıştırılabilir (idempotent). `wrangler whoami` kontrol eder (gerekirse `wrangler login`), D1 `openshelf` oluşturur/yeniden kullanır ve `database_id` değerini kökteki `wrangler.jsonc` dosyasına yazar, isteğe bağlı özel alan adı sabitler, R2 öncesi sorar, derler, migration'ları uygular (`--remote`), dağıtır, sonra `APP_ENCRYPTION_KEY` ve `SETUP_TOKEN` değerlerini stdin üzerinden `wrangler secret put` ile ayarlar (mevcut secret'lar ezilmez; tek seferlik `SETUP_TOKEN` sonda bir kez gösterilir).

Bayraklar: `--yes` (etkileşimsiz, ücretli eklentiler kapalı), `--enable-r2`, `--skip-deploy`, `--domain=https://shop.example.com`, `--db-name=AD`, `--local` (`.dev.vars` + yerel migration), `--dry-run`, `--mock` (dağıtımdan sonra Mock Modu açma adımlarını yazdırır).

## 3. Elle eşdeğeri

```bash
pnpm install && pnpm build                        # her şeyi dist-site/ içine derler
npx wrangler d1 create openshelf                  # yazdırılan database_id'yi wrangler.jsonc'a ekle
npx wrangler d1 migrations apply DB --remote
npx wrangler deploy
openssl rand -base64 32 | npx wrangler secret put APP_ENCRYPTION_KEY
openssl rand -hex 24    | npx wrangler secret put SETUP_TOKEN   # bir kez not al
```

GitHub Actions (`.github/workflows/deploy.yml`, manuel) `pnpm build` çalıştırır, migration uygular ve `wrangler deploy` yapar; `CLOUDFLARE_API_TOKEN` (Workers Scripts + D1 düzenleme) ve `CLOUDFLARE_ACCOUNT_ID` repo secret'ları gerekir.

## 4. İlk çalıştırma: `/admin/setup`

`https://<worker-adiniz>.workers.dev/admin/setup` adresini açın, `SETUP_TOKEN` girin, sahip hesabını oluşturun ve MFA'yı etkinleştirin. `APP_ENCRYPTION_KEY` yoksa veya hatalıysa kurulum ve giriş, ayarlanmasını söyleyen net bir `503 misconfigured` hatası döner.

Gerçek sağlayıcı olmadan denemek mi istiyorsunuz? **Mock Modu** açın (bkz. [mock-mode.tr.md](mock-mode.tr.md); `ALLOW_MOCK` değişkeni gerekir): `/mock/pay/...` sahte ödeme sayfası, SMS/e-postalar Mock Inbox'a düşer. Gerçek siparişten önce kapatın.

## 5. Secret ve değişkenler

| Ad | Tür | Not |
|---|---|---|
| `APP_ENCRYPTION_KEY` | secret | base64, 32 bayt. D1'deki entegrasyon secret'larını şifreler. Kaybetmeyin/sızdırmayın; bkz. [security.tr.md](security.tr.md) |
| `SETUP_TOKEN` | secret | tek seferlik, ilk yönetici oluşturma |
| `TURNSTILE_SECRET` | secret, isteğe bağlı | bot koruması |
| `ALLOW_MOCK` | var, isteğe bağlı | yayındaki Worker'da Mock Modunu açabilmek için gerekir; üretimde tanımsız bırakın |
| `STOREFRONT_ORIGIN`, `ADMIN_ORIGIN`, `API_ORIGIN` | vars, isteğe bağlı | varsayılan boş: istek origin'inden türetilir. Katı izin listesi için tam `https://` origin yazın (üretimde önerilir) |

Entegrasyon API anahtarları (iyzico, Trendyol, ...) Worker secret'ı DEĞİLDİR; Yönetim, Ayarlar, Entegrasyonlar'dan girilir (D1'de AES-256-GCM ile şifreli).

## 6. Özel alan adı

Panel: Workers, Worker'ınız, Settings, Domains & Routes, alan adınızı ekleyin (Cloudflare DNS'te olmalı). Yapılandırma değişikliği gerekmez (origin istekten gelir). Origin sabitlediyseniz üçünü de yeni alan adına güncelleyin. Admin cookie'leri `__Host-` önekli olduğundan HTTPS gerekir.

## 7. Cron

`"triggers": { "crons": ["* * * * *"] }` outbox, rezervasyon süresi dolumu ve Trendyol uzlaştırmasını her dakika çalıştırır. Ücretsiz plan limitine takılırsanız sıklığı düşürün (örn. `*/5 * * * *`); yeniden denemeler ve stok tutma süresi dolumu yavaşlar.

## 8. Tek Worker'ın yerel önizlemesi

```bash
cp .dev.vars.example .dev.vars   # iki secret'ı doldur
pnpm dev:site                    # derle + wrangler dev (yerel D1 için bir kez `pnpm setup:local`)
```

`pnpm dev` hâlâ API + iki Vite uygulamasını başlatır (admin: `http://localhost:5174/admin/`).

## 9. Güncelleme

Yeni kodu çekin, `pnpm install --frozen-lockfile`, `pnpm build` ve `pnpm run deploy` (Workers Builds ikisini de yapar). Önce verinizi dışa aktarın ([security.tr.md](security.tr.md)).

## Sorun giderme

- **`/admin/setup` `misconfigured` diyor**: `APP_ENCRYPTION_KEY` değerini (`openssl rand -base64 32`) Worker secret'ı olarak ayarlayıp tekrar deneyin.
- **Deploy butonu: derleme hatası**: derleme depo kökünde `pnpm build` çalıştırır (monorepo). Workers Builds günlüğüne bakın; Node 20+ ve pnpm gerekir.
- **Elle dağıtımda `database_id` / D1 hataları**: önce veritabanını oluşturun (`wrangler d1 create openshelf`) ve id'sini `wrangler.jsonc`'a yazın.
- **Admin vitrini veya boş sayfa gösteriyor**: `dist-site/admin/` var mı (`pnpm build`) ve `/admin/` adresini mi açıyorsunuz kontrol edin (sondaki eğik çizgi otomatik yönlendirilir).
- **Admin işlemlerinde 403 "Origin not allowed"**: `ADMIN_ORIGIN` değerini gezindiğinizden farklı bir alan adına sabitlemişsiniz; düzeltin veya temizleyin.
- **Derleme günlüğünde prerender uyarısı** ("API unreachable"): ilk derlemede beklenir; ürün sayfaları çalışma zamanında yüklenir.
