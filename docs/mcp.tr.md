# MCP: mağazayı AI asistanlarıyla yönetin

[English](mcp.md)

OpenShelf'in tüm yönetimi `https://<adresiniz>/mcp` adresinde bir **MCP sunucusu** (Streamable HTTP, durumsuz) olarak sunulur. Bir AI istemcisi (Claude Desktop, Claude Code, herhangi bir MCP istemcisi) soruları yanıtlar ve sipariş, ürün, stok, kupon, müşteri, kampanya, SMS/e-posta, fatura, ayar, Trendyol ve Geliver'ı yönetebilir.

## Bağlanma
1. Yönetim paneli → **Ayarlar → MCP / AI erişimi → Anahtar oluştur** (yalnızca owner/admin). Seviye ve süre seçin. Anahtar (`osk_…`) **bir kez** gösterilir.
2. Claude Code: `claude mcp add --transport http openshelf https://<adres>/mcp --header "Authorization: Bearer osk_…"`
   Genel istemci (JSON): `{"mcpServers":{"openshelf":{"type":"http","url":"https://<adres>/mcp","headers":{"Authorization":"Bearer osk_…"}}}}`
3. Sorun: "bugünkü siparişleri özetle", "hangi ürünlerin stoğu azaldı?", "İzmir'deki müşteriler için yaz kampanyası taslağı hazırla".

Sunucu JSON döner; istemci yalnızca SSE kabul ediyorsa tek bir `text/event-stream` olayı döner. Durumsuzdur (oturum yok), sade bir Worker'da çalışır.

### Grok, ChatGPT, Claude.ai ve diğer AI uygulamalarını bağlayın (OAuth)
Yapıştıracak anahtar yok: özel bir MCP sunucusu / bağlayıcı ekleyip `https://<adres>/mcp` adresini verin. Uygulama girişi kendisi bulur (OAuth 2.1 + PKCE, `/.well-known/oauth-protected-resource`), sizi yönetim paneline **giriş yapıp onaylamaya** yönlendirir (okuma / yazma / tam seçersiniz) ve 1 saatlik erişim anahtarı ile dönen 30 günlük yenileme anahtarı alır. Uygulamaları **Ayarlar → MCP → Bağlı uygulamalar** bölümünde görür ve **bağlantısını kesersiniz**.
- Kendini kaydeden uygulamalar (dinamik istemci kaydı) doğrudan çalışır. Bazıları (ör. Grok) bunun yerine **Client ID ve Client secret** ister: **Bağlı uygulamalar → Elle oluşturulan OAuth istemcileri** bölümünde (yalnızca owner) uygulamanın gösterdiği geri dönüş adresiyle bir tane oluşturun ve değerleri uygulamaya yapıştırın.
- Güvenlik: PKCE (S256) zorunludur, redirect adresleri birebir eşleşmelidir (https veya localhost), kodlar tek kullanımlıktır (5 dk), tekrar kullanılan kod veya yenileme anahtarı tüm bağlantıyı iptal eder, her bağlantı owner/admin onayı ister; onay ekranı uygulamanın (doğrulanmamış) adını ve döneceği adresi gösterir. Araç izinleri ve ana şalter yine geçerlidir. URL'de anahtar bilerek desteklenmez.

## Seviyeler
| Seviye | Yapabilir |
|---|---|
| **read** | her şeye bakar: pano, sipariş, müşteri, ürün, ayar, log, Trendyol sağlığı, önizleme, kitle büyüklüğü |
| **write** | + ürün, kategori, kupon, stok, sipariş durumu, ayar grubu, kampanya/fatura taslağı, Trendyol eşleştirme/aktarım |
| **full** | + iade, kargo, fatura, silme, e-posta/SMS/kampanya gönderme, anonimleştirme, CSV içe aktarma, ham Trendyol/Geliver çağrıları |

`full` araçlar yalnızca `confirm: true` ile çalışır; yoksa ne yapacaklarını anlatır. Anahtar sahibinin rolünü aşmaz ve asla *owner* gibi davranmaz.

## Araç izinleri (owner)
**Ayarlar → MCP / AI erişimi → Araçlar** her aracı gruplarıyla ve bir onay kutusuyla listeler. Bir aracın işaretini kaldırırsanız hiçbir AI istemcisi onu göremez veya çağıramaz; `full` anahtar olsa bile (araç yalnızca işaretliyse **ve** anahtarın seviyesi izin veriyorsa çalışır). Hazır ayarlar: yalnızca okuma araçları, `full` araçlar kapalı, hepsine izin ver. Ana şalter anahtarları silmeden tüm MCP erişimini kapatır. Yalnızca owner değiştirebilir; admin görüntüler; anahtar asla değiştiremez. Varsayılan: her şey açık.
- **Yükleme biletleri** (`create_upload_link`): HMAC imzalı, 10 dakika geçerli, tek başarılı yükleme, görsel türü sabit, `X-Upload-Ticket` başlığında gönderilir (adrese asla yazılmaz), yalnızca `/mcp/upload` kabul eder; API ya da MCP kabul etmez; bileti üreten yönetici devre dışı bırakılınca geçersiz olur. Yüklenen dosyalar yönetim paneli yüklemesiyle aynı doğrulamadan geçer (gerçek tür, boyut sınırları, kesik görsel reddi). Sahip `create_upload_link` ve `upload_media` araçlarını ayrı ayrı kapatabilir. ChatGPT'de eklenen dosyalar (`import_attached_files`) ve bağlantılar (`upload_media_from_url`) sunucu tarafında SSRF korumasıyla indirilir (yalnızca herkese açık https adresleri, yönlendirmeler yeniden denetlenir, boyut sınırlı).

## Ayar ve SEO araçları
- **Mağaza ayarları** (PATCH: yalnızca gönderdiğiniz alanlar değişir, iç içe nesneler birleşir, birleşmiş grup bütün olarak doğrulanır): `update_store_profile` (mağaza adı, slogan, iletişim, para birimi, vergi), `update_seo_settings`, `update_branding`, `update_legal_pages`, `update_checkout_settings`, `update_tracking_settings`, `update_notification_settings`; tek grup okumak için `get_settings_group`.
- **SEO**: `seo_audit` (site geneli anahtarlar + her ürün/kategori eksiği: başlık/açıklama yok, noindex, alt metinsiz görsel, tekrar eden başlık), `update_product_seo` / `update_category_seo` (yalnızca arama ve sosyal alanlar), `seo_preview` (Google/sosyal ağların tam olarak ne göreceği).

### Görsel ve dosya yükleme
Sohbet istemcileri uzun araç argümanlarını keser; büyük bir base64 metni eksik gelir (ve çok token harcar). Yapay zekâda **ne varsa** ona uygun yolu seçin; **`upload_help`** aracı hangisinin uygun olduğunu, gerçek adresle çalıştırılmaya hazır komutlarla söyler:

| Yapay zekâda olan | Kullanılacak | Maliyet |
|---|---|---|
| herkese açık https bağlantısı (üretilmiş görsel URL'si, CDN, Google Drive / Dropbox paylaşım bağlantısı) | `url` ile `add_product_images` / `set_store_image` (içe aktarır **ve** bağlar, tek çağrıda); `upload_media_from_url` tek çağrıda 10 bağlantı alır | birkaç token, tam boyut |
| kişinin **ChatGPT sohbetine eklediği** dosyalar | **`import_attached_files`** (ChatGPT indirme bağlantılarını `_meta["openai/fileParams"]` ile verir; `files` en üst düzey argümandır çünkü ChatGPT yalnızca en üst düzey dosya parametrelerini çözer; `productId` ile ürüne de bağlar; indirme bağlantısı olmayan dosya için açık bir `no_download_url` hatası döner) | konuşmada dosya baytı yok |
| **kendi kod ortamında (sandbox)** görsel dosyaları var ama MCP anahtarı yok (kod çalıştıran sohbet uygulamaları) | **`create_upload_link`** → tek kullanımlık biletler → `curl -X PUT -H "X-Upload-Ticket: …" --data-binary @dosya …/mcp/upload`, sonra `mediaId` ile bağlama | konuşmada dosya baytı yok |
| anahtarın elinde olduğu kabuk (Claude Code, Codex, Cursor, betikler) | `Authorization: Bearer` ile **`POST /mcp/upload`** adresine `curl` | konuşmada dosya baytı yok |
| yalnızca sohbet penceresi | insan dosyaları **Katalog → Medya** sayfasına bırakır; yapay zekâ `list_media` ile bulup kimlikleri bağlar | tek insan adımı |
| çok küçük görsel (< ~20 KB, örn. favicon) | `upload_media` (base64). Daha uzun veri okunmadan hemen reddedilir | son çare |

```sh
curl -sS -H "Authorization: Bearer $OPENSHELF_TOKEN" -F kind=product -F alt="Kısa açıklama" -F file=@./foto.jpg https://MAGAZANIZ/mcp/upload
```
**Biletler** (`create_upload_link`, `count` 1–10): her biri 10 dakika geçerlidir, **bir** görsel yükler (kesik dosyayla başarısız yükleme bileti harcamaz; 3 denemeden sonra durur), görsel türünü ve alt metni sabitler, `X-Upload-Ticket` başlığında gönderilir (adrese asla yazılmaz), anahtar içermez ve yalnızca `/mcp/upload` üzerinde çalışır: API'yi ya da MCP'yi açmaz. Bileti üreten yönetici devre dışı bırakılırsa bilet de geçersiz olur. Bazı sohbet uygulamaları kod ortamının ağını belirli alan adlarıyla sınırlar; `curl` bağlanamazsa kişinin mağaza alan adına bir kez izin vermesi gerekir. `upload_help` yapay zekâya görsel üretmeden ya da bilet istemeden önce çalıştıracağı tek satırlık bir **ön kontrol** verir (`curl <mağaza>/health` `200` yazdırmalı); `create_upload_link` bunu tekrarlar (`checkFirst`) ve kod ortamı bağlanamazsa (`Could not resolve host`, curl hata 6) `hostToAllow` ile iki çıkış yolunu anlatan hazır bir `tellTheHuman` metni (TR/EN) döndürür (uygulamada alan adına izin vermek ya da Katalog → Medya). Yapay zekâya durması, döngüye girmemesi, IP adresi denememesi ve `import_attached_files`ı ChatGPT dışında önermemesi söylenir.

`/mcp/upload`, yönetim paneli yüklemesiyle aynı doğrulamayı yapar (gerçek dosya türü, boyut sınırları, kesik görsel reddi) ve kayda geçer. Sahip, Ayarlar → MCP → Araçlar'dan `upload_media` (anahtarlı yükleme) ve `create_upload_link` (bilet) araçlarını ayrı ayrı kapatabilir.

**Bağlamak** için tüm ürünü göndermek gerekmez: `add_product_images` (`append`, `prepend` ya da `replace` modu; öğeler `mediaId`, `url` veya üründe zaten olan görselin `imageId`'si) ve `set_store_image` (`logo`, `logo_dark`, `favicon`, `og` ya da `banner`). İçe aktarmalar `warnings` döndürür (yanlış oran, çok küçük), böylece yapay zekâ yeniden üretebilir. `update_media_alt` alt metni değiştirir.

### Pazaryeri (Trendyol) fotoğrafları

Trendyol'dan içe aktarılan ürünlerin fotoğrafları Trendyol'un CDN'inde kalır. Yapay zekâ ortamları (tasarım ortamı, kod çalıştırıcılar) genelde oradan indiremez ve "erişim engellendi" hatası verir. İki şey çözer:

- **`view_image`**, görseli yapay zekâya **MCP bağlantısının içinden** gösterir (görsel bloğu); yüklenen medya ve CDN'deki ürün fotoğrafları için çalışır (`mediaId` ya da `get_product`'tan `productId` + `imageId`; en fazla ~1 MB). İndirme ya da yapay zekâ tarafında ağ erişimi gerekmez.
- **`proxyUrl`**: `get_product` / `list_products` sonuçlarında Trendyol'da barındırılan her görselin `proxyUrl` alanı da vardır: mağazanın kendi alan adında, herkese açık, mutlak bir bağlantı (`/img/p/<görsel kimliği>?v=…`). Tasarımın, sayfanın ya da mesajın `<img>` etiketine bunu koyun. Mağaza fotoğrafı bir kez kendi açık kimliğiyle indirir, gerçekten görsel olduğunu doğrular ve bir yıl boyunca uçta önbelleğe alarak sunar.

`/img/p/:id` **açık bir proxy değildir**: bağlantı bir adres değil, mağazanın ürünlerinden birine kayıtlı görselin kimliğini söyler; yalnızca Trendyol CDN alan adları (`dsmcdn.com`, `trendyol.com`) sunulur, karşı tarafın içerik türüne güvenilmez (gerçek tür baytlardan anlaşılır), önbellekte olmayan istekler hız sınırına tabidir ve mağazanın zaten barındırdığı görseller `/media/…` adresine yönlenir. MCP sonuçlarında yüklenen medya bağlantıları da (`url`) artık mutlaktır.

### Kullanıcı rehberi MCP üzerinden

Yönetim panelindeki rehberin tamamı (`apps/admin/src/help`) yapay zekâ istemcilerine de açıktır; asistan bir özelliğin nasıl çalıştığını tahmin etmek yerine rehberden öğrenir:

- **Araçlar:** `help_topics` (bölümler ve alt başlık kimlikleri), `help_search` (tam metin, aksan duyarsız: "kargo etiketi" araması "Kargo oluşturma"yı bulur), `help_read` (`topic`, isteğe bağlı `section`, `lang`; bütün bölümler 60 KB ile sınırlıdır, alt başlık okumak ucuzdur).
- **Kaynaklar:** MCP kaynaklarını destekleyen istemciler için her bölüm `openshelf://help/<bölüm>` adresindedir (`?lang=en|tr` eklenebilir).
- Türkçe ve İngilizce; varsayılan mağazanın dilidir. Markdown yapay zekâ için temizlenir (ekran görüntüleri kısa bir nota dönüşür, sözlük bağlantıları yalnızca metnini korur, iç bağlantılar `help_read`'e yönlenir).
- Rehber Worker'a anlık görüntü olarak gömülür (`workers/api/src/mcp/helpDocs.generated.ts`); `pnpm build` / `pnpm deploy` ile yeniden üretilir (`pnpm gen:help`). Bir rehber sayfası yeniden üretilmeden değişirse test başarısız olur.

## MCP'den asla erişilemeyenler
Kullanıcı/şifre/MFA, anahtar oluşturma, entegrasyon **sırlarını** yazma, mock modu anahtarı, fabrika sıfırlama, mock gelen kutusu, Trendyol geçmişi silme. Yeni bir admin rotası ne araç ne de hariç tutma listesinde ise `mcp.test.ts` kırılır (`workers/api/src/mcp/tools.ts`).

## Güvenlik notları
- Anahtar mağazayı yönetir: şifre gibi saklayın, aynı sekmeden iptal edin. Anahtarlar SHA-256 özeti olarak saklanır; anahtar başına dakikada 120 istek.
- Her araç çağrısı denetim kaydına yazılır (`mcp.tool`, anahtar kimliği, sonuç, argümansız); asıl yönetim işlemi de normal şekilde kaydedilir.
- Araçlar gerçek admin API'yi süreç içinde, HMAC imzalı 60 saniyelik dahili bir iddiayla çalıştırır; yetki, doğrulama ve hız sınırları panelle aynıdır. Anahtar `/api/admin/*`'a doğrudan erişemez.
- Pazarlama kampanyaları yalnızca pazarlama izni olan müşterilere gider. AI konuşmaları müşteri verisi içerebilir: `read` ile başlayın.

## Araç eklemek
`workers/api/src/mcp/tools.ts` dosyasına bir kayıt ekleyin (ad, seviye, method, path, zod şekli). Yanıtlar ~100 KB ile sınırlıdır.
