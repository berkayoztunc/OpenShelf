# Yapay zekâ (MCP) bağlantısı

Bu bölümde mağazanızı bir yapay zekâ asistanına (Claude, ChatGPT, Grok, Claude Code, Cursor gibi) nasıl bağlayacağınızı, asistanın neler yapabildiğini, güvenlik sınırlarını ve dosya yüklemenin en ucuz yolunu öğrenirsiniz. Asistan, yönetim panelindeki aynı kurallarla (doğrulama, yetki, denetim kaydı) çalışır.

## Yapay zekâ bağlantısı nedir?

OpenShelf, **MCP** (Model Context Protocol) adlı açık bir standart üzerinden yapay zekâ asistanlarına araçlar sunar. Asistan bu araçlarla siparişlere, ürünlere, stoğa, vitrine ve raporlara bakabilir; yetkisi varsa değişiklik de yapabilir. Her çağrı gerçek yönetim API'sinden geçer ve **Denetim kaydı**'na yazılır.

Asistan ilk bağlandığında iki şeyi okur: **mağaza rehberi** (birimler, kanallar, güvenlik kuralları) ve bu **kullanıcı rehberinin** (şu an okuduğunuz yer) tamamı. Böylece bir ayarın ne yaptığını tahmin etmek yerine rehberden öğrenir.

## Bağlanma ve anahtarlar

- **Sohbet uygulamaları (Claude.ai, ChatGPT, Grok):** Uygulamanın "bağlayıcı / connector" ekranına mağaza adresinizin sonuna `/mcp` ekleyerek girin (örn. `https://magazaniz.com/mcp`). Uygulama sizi yönetim panelindeki onay ekranına götürür (OAuth); oturum açıp izin verirsiniz. Anahtar kopyalamanız gerekmez.
- **Kod araçları ve betikler (Claude Code, Cursor, Codex):** **Ayarlar → MCP** sayfasında bir **anahtar** oluşturun (`osk_…` ile başlar, yalnızca bir kez gösterilir) ve araca `Authorization: Bearer <anahtar>` başlığıyla verin.
- Anahtarlara ad, **seviye** ve isteğe bağlı son kullanma tarihi verilir; istediğiniz an iptal edebilirsiniz. Adres içine anahtar yazılan bağlantılar desteklenmez (adresler günlüklere ve ekran görüntülerine girer).

## Seviyeler ve güvenlik

| Seviye | Yapabilecekleri |
|---|---|
| **read** | Yalnızca bakar: siparişler, ürünler, raporlar, rehber. |
| **write** | Geri alınabilir oluşturma ve düzenleme: ürün, fiyat, stok, vitrin, görsel, kampanya taslağı, SEO. |
| **full** | Para, müşteri mesajı ve silme gibi geri alınamaz işler. Bu araçlar `confirm: true` olmadan yalnızca ne yapacağını anlatır. |

- **Sahip (owner)**, **Ayarlar → MCP → Araçlar** sayfasında tek tek araçları kapatabilir ya da tüm MCP erişimini bir anahtarla durdurabilir.
- Yönetim kullanıcıları, anahtarlar, ödeme sağlayıcı sırları ve sistem/deneme modu MCP'den **hiç** değiştirilemez.
- Pazarlama mesajları yalnızca pazarlama izni olan müşterilere gider; mesajlara iptal bağlantısı otomatik eklenir.
- Müşteri kişisel verileri sonuçlarda bulunur; asistan bunları gereğinden fazla tekrarlamamalıdır. Güvenmediğiniz bir uygulamaya **read** seviyesinden fazlasını vermeyin.

## Araçlar neler yapar?

- **Raporlar:** `store_overview` (bugün ve duruma göre siparişler), `store_insights` (7/30/90 gün, önceki dönemle karşılaştırma, en çok satanlar, iller, yapılacaklar kuyruğu).
- **Siparişler:** `list_orders` (durum, kaynak, ödeme, kargo, fatura, tarih ve tutar filtreleri; ürün, müşteri ve takip numarasıyla arama), `get_order`, durum değiştirme, kargo, fatura, iade.
- **Ürünler:** `list_products` (stok, kanal, görselsiz filtreleri; fiyat, stok, satış sıralaması), `update_variant_price`, `bulk_update_products` (durum, kategori, yüzde fiyat), `adjust_stock`, `add_product_images`.
- **Vitrin:** `update_menu` (üst menü), `update_merchandising` (ürün sıralaması, sabitlenenler), `update_homepage` (ana sayfa ürünleri ve kategori kartı görünümü; kategori görseli `update_category` ile `imageMediaId` olarak eklenir).
- **Ayarlar ve SEO:** mağaza bilgileri, marka, SEO, yasal metinler, ödeme/kargo kuralları, takip, bildirimler; `seo_audit` ve ürün/kategori SEO araçları.
- **Dosya ve görsel:** `upload_help`, `upload_media_from_url`, `create_upload_link`, `import_attached_files`, `set_store_image`, `view_image`, `list_media`, `update_media_alt` (aşağıya bakın).
- **İleti ve kampanya:** e-posta/SMS gönderme ve kampanya taslakları (önce önizleme ve deneme gönderimi, onayla gönderme).
- **Rehber:** `help_topics`, `help_search`, `help_read` ve `openshelf://help/<bölüm>` kaynakları.
- **Entegrasyonlar:** Trendyol ve Geliver konsolları, entegrasyon olayları ve arka plan işleri.

Ayarlar → MCP sayfasında her aracın ne yaptığı ve seviyesi listelenir.

## Dosya ve görsel yükleme

Sohbet uygulamaları uzun araç argümanlarını keser; büyük bir base64 metni eksik gelir ve çok token harcar. Asistan **elindekine** göre en ucuz yolu seçer (`upload_help` aracı bunu söyler):

1. **Herkese açık bağlantı varsa** (üretilmiş görsel adresi, CDN, Google Drive/Dropbox paylaşım bağlantısı): `add_product_images` veya `set_store_image` içinde `url` verilir; görsel içe aktarılır **ve** bağlanır, tek çağrıda. `upload_media_from_url` tek çağrıda 10 bağlantı alır.
2. **ChatGPT'de sohbete görsel eklediyseniz:** `import_attached_files` aracı eklediğiniz dosyaları orijinal kalitede indirir; `productId` verilirse aynı çağrıda ürüne de bağlar. Dosya baytları konuşmaya girmez.
3. **Asistanın kod ortamında (sandbox) görseller varsa ama MCP anahtarı yoksa** (üretilmiş ya da sizin yüklediğiniz dosyalar): `create_upload_link` tek kullanımlık **bilet** verir; asistan kod ortamından `X-Upload-Ticket` başlığıyla `curl -X PUT` ile dosyayı gönderir. Bilet 10 dakika geçerlidir, yalnızca **bir** görsel yükler, türü sabittir ve anahtar içermez. Bazı uygulamalar kod ortamının ağını belirli alan adlarıyla sınırlar; bağlanamazsa mağaza alan adına bir kez izin vermeniz gerekir. Asistan önce bir **ön kontrol** çalıştırır (`curl …/health` 200 yazdırmalı); bağlanamazsa kredi harcamadan durur, döngüye girmez ve 5. yola geçer.
4. **Kabuk varsa ve anahtar asistandaysa** (Claude Code, Codex, Cursor): dosya `POST /mcp/upload` adresine `Authorization: Bearer` ile `curl` ile gönderilir.
5. **Hiçbiri yoksa:** siz dosyaları **Katalog → Medya** sayfasına bırakırsınız; asistan `list_media` ile en yenileri bulup bağlar.
6. **Çok küçük görselde (~20 KB altı, örn. favicon):** `upload_media` (base64). Daha büyüğü okunmadan reddedilir.

```sh
curl -sS -H "Authorization: Bearer $OPENSHELF_TOKEN" -F kind=product -F alt="Kısa açıklama" -F file=@./foto.jpg https://MAGAZANIZ/mcp/upload
```
`/mcp/upload` yönetim paneli yüklemesiyle aynı doğrulamayı yapar (gerçek dosya türü, boyut sınırları, kesik görsel reddi) ve kayda geçer. Anahtarla ya da biletle kullanılır; **ikisi de yoksa yükleme yapılamaz**. Sahip, Ayarlar → MCP → Araçlar'dan `upload_media` (anahtarlı yükleme) ve `create_upload_link` (bilet) araçlarını ayrı ayrı kapatabilir. Bilet yalnızca yüklemeye yarar; API'yi ya da MCP'yi açmaz.

Ürün görseli eklemek için tüm ürünü yeniden göndermek gerekmez: `add_product_images` ekler, başa alır ya da galeriyi yeniden sıralar. Logo, favicon, sosyal paylaşım görseli ve ana sayfa afişi için `set_store_image` kullanılır. Her içe aktarma, ölçü uygun değilse **uyarı** döndürür (yanlış oran, çok küçük); asistan görseli yeniden üretebilir.

## Trendyol fotoğrafları

Trendyol'dan içe aktarılan ürünlerin fotoğrafları Trendyol'un CDN'inde kalır. Yapay zekâ ortamları (tasarım ortamı, kod çalıştırıcılar) çoğunlukla oradan indiremez ve "erişim engellendi" der. İki çözüm vardır:

- `view_image` görseli asistana **MCP bağlantısının içinden** gösterir; indirme gerekmez.
- Ürün sonuçlarındaki `proxyUrl`, mağazanın kendi alan adında herkese açık bir bağlantıdır; tasarımın ya da sayfanın `<img>` etiketine bu konur. Mağaza fotoğrafı bir kez indirir, gerçekten görsel olduğunu doğrular ve bir yıl önbelleğe alır. Bu **açık bir proxy değildir**: yalnızca ürünlerinize kayıtlı görsellerin kimliğiyle çalışır ve yalnızca Trendyol CDN alan adlarına gider.

## Rehberi yapay zekâya açma

Bu kullanıcı rehberinin tamamı asistana da açıktır:

- `help_topics` bölümleri ve alt başlıkları listeler, `help_search` bir soruyu arar, `help_read` bir bölümü ya da alt başlığı okur (`topic`, `section`, `lang`).
- Kaynak (resource) destekleyen uygulamalarda her bölüm `openshelf://help/<bölüm>` adresiyle de okunabilir.
- Rehber Türkçe ve İngilizce sunulur; varsayılan, mağazanın dilidir.
- Rehberde bir sayfayı değiştirirseniz yapay zekânın okuduğu kopya bir sonraki yayında (deploy) güncellenir.

## Sık yapılan hatalar

- **Asistan yeni araçları görmüyor:** Uygulamalar araç listesini bağlanırken alır. Bağlantıyı kesip yeniden bağlayın ya da uygulamayı yeniden başlatın.
- **"Bu araç write seviyesi istiyor":** Anahtarın seviyesi yetersiz. Ayarlar → MCP'den daha yüksek seviyeli yeni anahtar oluşturun.
- **"Araç sahip tarafından kapatılmış":** Ayarlar → MCP → Araçlar'da o aracı açın (yalnızca sahip).
- **Büyük görsel base64 ile yüklenmeye çalışılıyor:** Reddedilir; asistanı `upload_help`'e yönlendirin ya da dosyayı Katalog → Medya'ya bırakın.
- **Asistan `Could not resolve host: magazaniz.com` (curl hata 6) alıyor:** Bu mağazanın hatası değil; asistanın kod ortamının ağı yalnızca izin verilen alan adlarına açık ve mağaza alan adını çözemiyor. MCP ve biletler çalışır, yalnızca `curl` çıkamaz. Çözüm: kullandığınız uygulamanın kod ortamı/ağ ayarlarında mağaza alan adına bir kez izin verin; olmuyorsa dosyaları Katalog → Medya sayfasına bırakın. Asistan işe başlamadan önce `upload_help` içindeki ön kontrolü (`curl …/health` 200 yazdırmalı) çalıştırır; başarısızsa kredi harcamadan durur ve size bu iki seçeneği söyler. `import_attached_files` yalnızca ChatGPT eklerinde çalışır, başka uygulamalarda önerilmez.
- **ChatGPT `import_attached_files` çağrısında dosya bağlantısını (`download_url`) boş gönderiyor:** ChatGPT yalnızca araç tanımında **en üst düzey** dosya parametresi olarak işaretlenmiş alanlara indirme bağlantısı ekler; bu araç artık böyle tanımlı. Hâlâ boş geliyorsa uygulama dosyayı araca aktaramıyor demektir: araç bunu 'indirme bağlantısı yok' diye açıkça bildirir, asistan tekrar denemez. Çözüm: dosyaları Katalog → Medya sayfasına bırakın ya da herkese açık bir bağlantı verin. ChatGPT'nin kod ortamı internete çıkamadığından `create_upload_link` ChatGPT'de çalışmaz.
- **Vitrin değişikliği hemen görünmüyor:** Vitrin yanıtları kısa süre önbelleğe alınır; yaklaşık bir dakika bekleyin.
