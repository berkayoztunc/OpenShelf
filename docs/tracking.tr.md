# Takip: Consent Mode v2 ile GA4 + Meta

[English](tracking.md)

## Model

- Herkese açık kimlikler (GA4 Measurement ID, GTM container, Meta Pixel ID, Meta test olay kodu) Admin → Ayarlar → Takip'e girilir.
- Secret'lar (GA4 Measurement Protocol `api_secret`, Meta Conversions API erişim token'ı) Admin → Ayarlar → Entegrasyonlar'a girilir (şifreli).
- `consentRequired` açıkken vitrin, rıza verilene kadar hiçbir şey yüklemez. Rıza durumu `{necessary, analytics, marketing}` istemcide tutulur ve `POST /api/store/consent` ile kaydedilir (`customer_consents`).
- Consent Mode v2: banner seçiminden önce `ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage` varsayılanı `denied`'dır; banner bunları günceller (analytics → `analytics_storage`; marketing → üç reklam sinyali).
- Sunucu tarafı: purchase olayları yalnızca doğrulanmış ödemeden ve siparişin kayıtlı rıza anlık görüntüsü izin veriyorsa Worker tarafından gönderilir. Aksi halde deneme `skipped_no_consent` olarak kaydedilir.

## Olaylar

| Kanonik (GA4) | Meta | Not |
|---|---|---|
| `page_view` | `PageView` | |
| `view_item_list` | yok | yalnızca GA4 |
| `view_item` | `ViewContent` | `content_ids` = varyant id |
| `search` | `Search` | |
| `add_to_cart` | `AddToCart` | |
| `begin_checkout` | `InitiateCheckout` | |
| `add_payment_info` | `AddPaymentInfo` | |
| `purchase` | `Purchase` | yalnızca sunucu üretir, doğrulanmış ödemede |
| `refund` | yok | yalnızca GA4 |

Öğe id'si her yerde ürün varyant id'sidir (GA4 `item_id`, Meta `content_ids`) ve Meta katalog feed'i (`/feeds/meta.xml`, `/feeds/meta.csv`) ile eşleşir. Olaylardaki tutarlar ana birimdir (örn. 199.90); veritabanından farklıdır.

## `event_id` ile tekilleştirme

Her olay bir UUID `event_id` taşır. Tarayıcı pikseli bunu `eventID` olarak, sunucu (CAPI) aynı değeri `event_id` olarak gönderir. Meta aynı olay adı ve id'ye sahip tarayıcı+sunucu çiftlerini (kendi penceresi içinde) tekilleştirir. GA4 için Measurement Protocol `transaction_id` ve `marketing_events` tekil anahtarı `(event_id, name, destination)` çift sunucu gönderimini engeller; farklı id'li ikinci bir tarayıcı `purchase` göndermeyin. Sunucu doğruluk kaynağıysa sipariş sayfası tarayıcıdan purchase tetiklemez.

Atıf verisi (`fbc`, `fbp`, `fbclid`, `gclid`, GA client id, UTM) checkout'ta toplanır ve sunucu olayları için siparişle saklanır. Meta'ya gönderilen müşteri tanımlayıcıları normalize edildikten sonra SHA-256 ile özetlenir.

## Test

Meta:
1. Events Manager → Pixel'iniz → Test events; test kodunu Admin → Ayarlar → Takip → Meta test olay kodu alanına girin.
2. Vitrini gezin (pazarlama rızasını kabul edin), tarayıcı olaylarını doğrulayın. Sandbox sipariş verin; sunucu `Purchase` olayının "Server" olarak göründüğünü ve ikisi de varsa tarayıcı olayıyla tekilleştirildiğini doğrulayın.
3. Yayından önce test kodunu kaldırın.

GA4:
1. `?debug_mode=1` ekleyin veya GA Debugger eklentisini kullanın; Admin → DebugView'ı açın.
2. Olayları ve parametreleri, ve rıza öncesi hiçbir olay gitmediğini doğrulayın. Measurement Protocol sunucu olayları DebugView'da yalnızca debug uç noktasıyla doğrulanırsa görünür; sunucu purchase'larını Realtime/Raporlar'da kontrol edin.
3. OpenShelf Admin → Pazarlama olayları'nda durumlara bakın: `sent`, `failed`, `skipped_no_consent`.

## Uyarılar

- Rıza banner'ı metni ve hukuka uygunluğu sizin sorumluluğunuzdadır ([legal-notes.tr.md](legal-notes.tr.md)).
- Reklam engelleyiciler ve rıza reddi tarayıcı olay hacmini düşürür; bu beklenen bir durumdur.
- Meta/GA4 arayüzleri ve gereksinimleri değişir; güncel sağlayıcı dokümanıyla doğrulayın.
