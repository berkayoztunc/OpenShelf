# Güvenlik

[English](security.md) · Açık bildirimi: [../SECURITY.md](../SECURITY.md)

## Tehdit modeli özeti

| Tehdit | Önlem |
|---|---|
| Yönetici hesabı ele geçirme | PBKDF2-SHA256 parola özeti, opsiyonel TOTP MFA, giriş oran sınırı, rastgele 256-bit oturum token'ı (yalnızca SHA-256 özeti saklanır), `__Host-` HttpOnly Secure SameSite=Lax çerez, boşta + mutlak zaman aşımı, tüm oturumları kapatma |
| CSRF / cross-origin kötüye kullanım | Tüm admin yazma isteklerinde `X-CSRF-Token` + `Origin` kontrolü; CORS yalnızca tanımlı origin'ler |
| Sahte ödeme/webhook çağrıları | Ham gövdede imza doğrulama, sunucudan sunucuya yeniden sorgu, tutar/sipariş eşleşmesi, `webhook_receipts` ile tekrar koruması |
| Fazla satış / çift işleme | İşlemsel rezervasyon, tekil kısıtlar, idempotent outbox handler'ları |
| Kart verisi sızıntısı | Hosted ödeme formu; kart verisi OpenShelf'e ulaşmaz |
| Enjeksiyon / XSS | Tüm girdide Zod, parametrik sorgular (Drizzle), sıkı CSP, SVG yükleme yok, magic-byte kontrolü |
| Adaptörler üzerinden SSRF / veri sızdırma | Adaptör başına sabit çıkış host izin listesi |
| Secret sızıntısı | Secret'lar istemci paketinde yok, loglar maskeli, API'den dönmez, bekleme halinde şifreli |
| Bot kötüye kullanımı | Giriş/checkout/kupon/arama oran sınırı, opsiyonel Turnstile |
| İç hata / yanlışlık | RBAC, tüm yazmalarda denetim kaydı |

Kapsam dışı: ele geçirilmiş Cloudflare hesabı, ele geçirilmiş yönetici cihazı, sağlayıcı tarafı ihlaller.

## Bekleyen secret'lar

- Worker secret'ları (`APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, `TURNSTILE_SECRET`) Cloudflare'in secret deposundadır. `.dev.vars` yalnızca yereldir ve git dışıdır.
- Entegrasyon secret'ları `APP_ENCRYPTION_KEY` ile AES-256-GCM (her yazımda rastgele IV) şifrelenir, `integration_configs` içinde saklanır, admin'de yalnızca maskeli görünür (yaz-only, değiştirmek için yeniden girin).
- CI gitleaks ve `pnpm audit` çalıştırır. Dağıtım için asgari yetkili Cloudflare API token'ı kullanın.

## `APP_ENCRYPTION_KEY` rotasyonu

Etki: D1'deki entegrasyon secret'ları, onları şifreleyen anahtar olmadan okunamaz (`key_version` bunu izler). Anahtar kaybolursa entegrasyon secret'larını yeniden girmeniz gerekir; müşteri ve sipariş verisi etkilenmez.

Güvenli prosedür:

1. Yapılandırmayı dışa aktarın (Admin → Ayarlar → Yedek/Export; config export secret içermez) ve hangi entegrasyonların açık olduğunu not edin. Sağlayıcı kimlik bilgilerini elinizde tutun (yeniden gireceksiniz).
2. D1 dışa aktarımı alın (aşağıda Yedekleme).
3. Yeni anahtar üretin: `openssl rand -base64 32`, ardından (`workers/api` içinden) `npx wrangler secret put APP_ENCRYPTION_KEY` ile girin. Worker'ın alması için dağıtın.
4. Çözülemeyen entegrasyonlar sağlıksız görünür. Admin → Ayarlar → Entegrasyonlar'da her secret'ı yeniden girin ve "Bağlantıyı test et"e basın. Secret yazmak onu yeni anahtar ve yeni `key_version` ile yeniden şifreler.
5. Eski ana anahtarın sızmış olabileceğinden şüpheleniyorsanız sağlayıcı tarafı kimlik bilgilerini de yenileyin (eski anahtar + D1 kopyası eski şifreli verileri çözebilir).
6. Tüm entegrasyonların sağlıklı olduğunu ve bu aralıkta outbox'ta `dead` iş kalmadığını doğrulayın.

Admin ileride yerinde yeniden şifreleme (eski anahtarla çöz, yeniyle şifrele) sunarsa onu tercih edin ve sürüm notlarını izleyin.

`SETUP_TOKEN`: tek kullanımlık; ilk yönetici oluşmadan önce `wrangler secret put SETUP_TOKEN` ile değiştirilebilir. Cloudflare dağıtım token'ını düzenli yenileyin.

## Yedekleme ve dışa aktarma

- Admin → Ayarlar → Yedek/Export: ürün, sipariş, müşteri için CSV/JSON; config export (secret yok).
- Tüm veritabanı: `npx wrangler d1 export openshelf --remote --output=backup.sql` (`workers/api` içinden). Dosya kişisel veri içerir: şifreli saklayın, erişimi kısıtlayın, eski kopyaları silin. D1 Time Travel yakın zamana geri dönüş sağlar; planınızdaki güncel saklama süresini kontrol edin.
- Geri yüklemeyi düzenli olarak boş bir veritabanında deneyin.

## Kişisel veri

Müşteri anonimleştirme (`POST /api/admin/customers/:id/anonymize`), yasal olarak mümkün olduğunda KVKK/GDPR silme taleplerini destekler (fatura ve muhasebe kayıtları saklanmak zorunda olabilir). Bkz. [legal-notes.tr.md](legal-notes.tr.md).

## İşletmeci kontrol listesi

Her yönetici için MFA; benzersiz 12+ karakter parola; origin'ler tam üretim URL'leri; Turnstile açık; bağımlılıkları güncel tutun (Dependabot); denetim kayıtlarını inceleyin; Cloudflare hesap erişimini sınırlayın.
