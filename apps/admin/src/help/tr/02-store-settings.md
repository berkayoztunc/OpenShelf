# Mağaza ayarları

Bu bölümde **Mağaza ayarları** ekranının sekmelerini tek tek öğrenirsiniz: mağazanızın adı ve vergi bilgileri, logo ve renkler, arama motoru görünümü, yasal metinler, ödeme ve kargo kuralları, reklam/analitik kimlikleri, müşteriye giden bildirimler ve sistem anahtarı (deneme modu). Her sekmede alanların ne işe yaradığını, örnek değerlerini ve yanlış doldurulursa ne olacağını bulacaksınız.

Sol menüden **Mağaza ayarları**'na tıklayın. Ekranın solunda (dar ekranda üstte) sekmeler yer alır: **Genel**, **Marka**, **SEO**, **Yasal metinler**, **Ödeme ve sipariş**, **Takip ve reklam**, **Bildirimler**, **Sistem**.

> [!NOTE]
> Her sekmenin altında yapışkan bir kaydet çubuğu vardır. Bir alanı değiştirdiğinizde çubukta "Kaydedilmemiş değişiklik" uyarısı belirir; **Değişiklikleri kaydet** düğmesine basmadıkça hiçbir şey uygulanmaz. Her sekme ayrı kaydedilir: bir sekmede değişiklik yapıp kaydetmeden başka sekmeye geçerseniz o değişiklik kaybolur.

## Genel

![Genel ayarlar sekmesi](help/tr/settings-general.png)

Bu sekme mağazanızın kimliğidir. Girdiğiniz bilgiler vitrinde, faturalarda, e-postalarda, yasal metinlerde ve kargo etiketinde görünür.

### Mağaza kartı

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Mağaza adı** (zorunlu) | Müşterinin gördüğü ticari adınız | Seramik Atölyesi | En fazla 80 karakter. E-posta ve SMS şablonlarındaki `{{storeName}}` bu alandan gelir. |
| **Slogan** | Bir cümlelik tanıtım | El yapımı seramikler | En fazla 160 karakter. Ana sayfa başlığı boşsa buradan türetilir. |
| **Açıklama** | Mağazanızı anlatan kısa metin | İstanbul'da üretilen el yapımı seramik… | En fazla 500 karakter. Arama sonuçlarında açıklama olarak kullanılabilir. |

### İletişim ve işletme bilgileri

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **İletişim e-postası** | Müşterilerin size yazacağı adres | destek@magazaniz.com | KVKK ve iade metinlerinde `{contactEmail}` olarak kullanılır. Panelden e-posta gönderirken, bildirim ayarlarında gönderen e-posta boşsa gönderen adres olarak da bu kullanılır. |
| **İletişim telefonu** | Mağaza telefonu | +90 530 123 45 67 | Yalnızca görüntülenir. |
| **Adres** | Fatura adresiniz | Moda Cad. No:12 Kadıköy/İstanbul | Mesafeli satış sözleşmesinde `{address}`, faturalarda satıcı adresi olarak görünür. |
| **Vergi no / TCKN** | VKN (10 hane) veya şahıs firmasıysanız TCKN (11 hane) | 1234567890 | Faturalarda ve sözleşmede görünür; yanlışsa belgeler hatalı olur. [VKN ve TCKN](term:vkn) farkı için [Faturalar](/help/invoices#vkn-ve-tckn) bölümüne bakın. |

### Fiyat ve bölge

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Para birimi** | TRY, USD, EUR veya GBP | TRY | Mağazanın tek para birimidir. Yayına geçtikten sonra değiştirmeyin; geçmiş siparişler eski para biriminde kalır. |
| **Varsayılan KDV oranı (%)** | Ürünlerde özel oran yoksa kullanılacak oran | 20 | 0–100 arası tam sayı. Faturalardaki satır KDV'sinin varsayılanıdır. Bkz. [KDV hesabı](/help/invoices#kdv-hesabi). |
| **Varsayılan dil** | Vitrinin açılış dili: Türkçe veya İngilizce | Türkçe | Müşteri bildirimleri de bu dilde gönderilir. |
| **Saat dilimi** | Mağazanızın saat dilimi | Europe/Istanbul | **Genel bakış**'taki "bugünün satışı" bu saat diliyle hesaplanır. |
| **Fiyatlara KDV dahil** | Açık: girdiğiniz fiyatlar KDV dahildir. Kapalı: KDV üstüne eklenir. | Açık | Türkiye'de perakende satışta genellikle açıktır. Yayına geçtikten sonra değiştirmeyin; tüm fiyatların anlamı değişir. |

> [!WARNING]
> **Fiyatlara KDV dahil**, **Para birimi** ve **Vergi no / TCKN** gibi alanları satış başladıktan sonra değiştirmek, faturaların ve raporların tutarsız olmasına neden olur. Yayına geçmeden önce kesinleştirin; sonra mali müşavirinize danışmadan değiştirmeyin.

### Sık yapılan hatalar

- Mağaza adını ticari unvanla karıştırmak: **Mağaza adı** müşterinin gördüğü isimdir; resmî unvanınızı faturada **Adres** ve **Vergi no** ile birlikte belirtirsiniz.
- Vergi numarasını boşlukla veya tire ile yazmak. Yalnızca rakam yazın.
- Telefonu uluslararası biçimde yazmamak. Bildirimlerde kullanılacak yönetici telefonu **Bildirimler** sekmesinde ayrıca (+90 ile) girilir.

## Marka

![Marka sekmesi](help/tr/settings-branding.png)

Vitrinin görünümünü belirler: logo, ana sayfa görselleri ve renkler.

| Bölüm | Alan | Açıklama |
|---|---|---|
| **Logo ve favori simgesi** | **Logo** | PNG, JPEG veya WebP; en fazla 512 KB. Sitenin üst köşesinde görünür. |
| | **Logo (koyu mod)** | Koyu arka planda kullanılacak açık renkli sürüm. Boşsa normal logo kullanılır. |
| | **Favori simgesi (favicon)** | Tarayıcı sekmesindeki küçük simge. Kare PNG, en fazla 512 KB. |
| **Ana sayfa afişleri** | Görseller | En fazla 6 adet; her biri en fazla 1,5 MB. Geniş formatta (örneğin 1600×600) hazırlayın. Sıralarını yukarı/aşağı okları ile değiştirebilirsiniz. |
| | **Afiş başlığı**, **Afiş alt başlığı** | Görselin üstünde görünen yazılar. |
| | **Düğme yazısı**, **Düğme bağlantısı** | Örneğin "Alışverişe başla" → `/collections/yeni`. |
| **Marka renkleri** | **Ana renk**, **Vurgu rengi** | 6 haneli renk kodu, örneğin `#3B3F8F`. Renk seçiciyi veya kodu yazarak girin. Canlı önizleme sağda değişir. |
| **Sosyal medya bağlantıları** | Instagram, Facebook, X, YouTube, TikTok | Tam adres (`https://…`) yazın; boş bıraktığınız simge görünmez. |

### Görsel hazırlama ipuçları

1. Logonuzun arka planı şeffaf (PNG) olsun; karanlık mod için ayrı sürüm yükleyin.
2. Banner'larda önemli yazıyı görselin ortasına yakın tutun; mobilde kenarlar kırpılabilir.
3. Metin ile arka plan arasında yeterli karşıtlık olmasına dikkat edin. Ana renk, metin rengiyle okunabilir olmalıdır.
4. Görselleri yüklemeden önce küçültün; büyük dosyalar sayfanın yavaş açılmasına neden olur.

### Sık yapılan hatalar

- Renk kodunu `#` olmadan veya 3 haneli yazmak ("Altı haneli bir renk kodu girin" uyarısı alırsınız).
- 512 KB'tan büyük logo yüklemek.
- Banner düğme bağlantısına yanlış yol yazmak. Siteniz içinde bir sayfaya gidecekse `/` ile başlayan yol kullanın.

## SEO ayarları

![SEO sekmesi](help/tr/settings-seo.png)

Bu sekme, mağazanızın Google gibi arama motorlarında ve sosyal medyada paylaşıldığında nasıl görüneceğini belirler. Ürün sayfalarının kendi başlık/açıklamaları ise **Ürünler** ekranında düzenlenir. Teknik terimler ve ayrıntılı anlatım için [SEO bölümüne](/help/seo) bakın.

| Bölüm | Alan | Ne yazılır | Dikkat |
|---|---|---|---|
| **Sayfa başlıkları** | **Başlık şablonu** | `%s \| {storeName}` | `%s` sayfanın kendi başlığıyla, `{storeName}` mağaza adınızla yer değiştirir. Ürün, kategori ve içerik sayfalarına uygulanır. `%s` yoksa şablon uygulanmaz. |
| **Ana sayfa** | **Ana sayfa başlığı** | Seramik Atölyesi – El yapımı seramikler | En fazla 120 karakter. Boşsa mağaza adı ve slogan kullanılır. Sayaç ideal uzunluğu gösterir. |
| | **Ana sayfa açıklaması** | 155 karakter civarı özet | En fazla 320 karakter. Boşsa mağaza açıklaması kullanılır. Google önizlemesi altta canlı görünür. |
| **Sosyal paylaşım** | **Varsayılan sosyal görsel** | 1200×630, 1 MB altı | Sayfanın kendi görseli yoksa kullanılır ([OG görseli](term:ogimage)). |
| | **X / Twitter kullanıcı adı** | @magazaniz | Harf, rakam ve alt çizgi; en fazla 15 karakter. |
| **Arama motoru erişimi** | **Arama motorlarının bu mağazayı dizinlemesine izin ver** | Açık | Kapatırsanız her sayfaya `noindex` etiketi eklenir ve `robots.txt` taramayı engeller; mağazanız Google'da görünmez. Bkz. [noindex](term:noindex), [robots.txt](term:robots). |
| | **Yapılandırılmış veri (JSON-LD)** | Açık | Kuruluş, ürün ve fiyat bilgisini arama motoruna makine okunur biçimde verir; zengin sonuç için gereklidir. Bkz. [JSON-LD](term:jsonld). |
| | **Engellenecek yol** | `/internal/` | `robots.txt`'e eklenen ek kurallar (en fazla 30). `/` ile başlamalıdır. |
| **Site doğrulama** | **Google Search Console**, **Bing Webmaster Tools**, **Facebook alan adı doğrulama** | Yalnızca doğrulama kodu | HTML etiketindeki `content` değerini yapıştırın; etiketin tamamını değil. |

> [!WARNING]
> Mağazanızı yayına açtıktan sonra **Arama motorlarının bu mağazayı dizinlemesine izin ver** seçeneğinin **açık** olduğundan emin olun. Deneme aşamasında kapalı tutmak mantıklıdır; ancak unutulursa mağazanız aylarca arama sonuçlarında görünmez.

Site haritası (`sitemap.xml`) otomatik üretilir; [site haritası](term:sitemap) ayarı yoktur. Adres yönlendirmeleri için [SEO bölümüne](/help/seo#adres-yonlendirmeleri) bakın.

## Yasal metinler

![Yasal metinler sekmesi](help/tr/settings-legal.png)

Müşterinin ödeme öncesinde göreceği ve onaylayacağı yasal belgeleri burada yazarsınız. Beş belge vardır: **KVKK**, **Mesafeli satış**, **İade**, **Çerezler**, **Gizlilik**. Üstteki küçük sekmelerle belgeler arasında geçin.

1. **Yasal metinler** sekmesini açın.
2. Üstten belgeyi seçin (örneğin **KVKK**).
3. Boş metin alanının üstündeki **TR şablonunu ekle** veya **EN şablonunu ekle** düğmesine basarak bir başlangıç metni yükleyin.
4. Metni işletmenize göre düzenleyin. Metin **Markdown** biçimindedir: `#` başlık, `**kalın**`, `- liste` kullanabilirsiniz.
5. **Değişiklikleri kaydet**'e basın.

Metinlerde şu yer tutucular vitrinde otomatik doldurulur: `{storeName}` (mağaza adı), `{contactEmail}` (iletişim e-postası), `{taxId}` (vergi no), `{address}` (adres). Bu yüzden önce **Genel** sekmesini doldurun.

| Belge | Ne için | Ne zaman gösterilir |
|---|---|---|
| **KVKK** | [KVKK](term:kvkk) aydınlatma metni | Müşteri kişisel veri girerken |
| **Mesafeli satış** | [Mesafeli satış](term:distancesales) sözleşmesi ve ön bilgilendirme | Ödeme öncesi; müşteri onaylamadan sipariş oluşmaz |
| **İade** | İade ve değişim koşulları, cayma hakkı | Alt bilgide ve ödeme öncesinde |
| **Çerezler** | Çerez politikası | Çerez bannerında |
| **Gizlilik** | Gizlilik politikası | Alt bilgide |

> [!DANGER]
> Pakette gelen şablonlar **hukuki danışmanlık değildir**; yalnızca başlangıç metnidir. KVKK, mesafeli satış, cayma ve çerez kuralları işletmenize, ürünlerinize ve mevzuattaki değişikliklere göre farklılaşır. Gerçek sipariş almadan önce bir avukata inceletin. Uyumdan ve metinlerin içeriğinden siz sorumlusunuz.

### Sık yapılan hatalar

- Şablonu hiç değiştirmeden yayına almak (örneğin teslimat süresi veya iade süresi işletmenizle uyuşmayabilir).
- Mesafeli satış sözleşmesini boş bırakmak: müşteri ödeme öncesinde onaylayacak metin bulamaz.
- **Genel** sekmesindeki adres/vergi no boşken yer tutucuların metinde boş görünmesi.

## Ödeme ve sipariş

![Ödeme ve sipariş sekmesi](help/tr/settings-checkout.png)

Bu sekme (arka planda "checkout" olarak geçer) müşterinin sepetten ödemeye kadar yaşadığı kuralları belirler.

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Üyeliksiz alışverişe izin ver** | Üye olmadan sipariş verilebilsin mi | Açık | Kapatırsanız müşteri sipariş için hesap açmak zorunda kalır; çoğu mağazada dönüşümü düşürür. |
| **Stok ayırma süresi (dakika)** | Müşteri ödemeye geçtiğinde ürünün kaç dakika ayrılacağı | 15 | 5–120 arası. Süre dolduğunda ödenmemiş sipariş otomatik **İptal edildi** olur, stok serbest kalır, kupon hakkı iade edilir. Bkz. [stok rezervasyonu](term:reservation). |
| **Güvenlik stoğu** | Her varyantta satışa sunulmayıp ayrı tutulan adet | 1 | Örneğin stok 3, güvenlik stoğu 1 ise vitrinde en fazla 2 adet satılabilir. Bkz. [güvenlik stoğu](term:safetystock). |
| **Sabit kargo ücreti** | Her siparişe eklenecek kargo bedeli | 49,90 | Para birimi cinsinden, virgülle yazın. 0 ise kargo ücretsizdir. |
| **Ücretsiz kargo sınırı** | Sepet bu tutara ulaşınca kargo bedava | 750 | Boş bırakırsanız ücretsiz kargo uygulanmaz. Bkz. [ücretsiz kargo eşiği](term:freeshipping). |

### Rezervasyon süresi nasıl seçilir?

- **Çok kısa (5–10 dk):** Müşteri kartını bulurken süre dolabilir; ödeme başarılı olsa bile sipariş zaten iptal edilmiş olabilir. Sistem bu durumu "geç ödeme" olarak kaydeder ve size **Entegrasyon olayları** ekranında "elle iade gerekir" uyarısı verir.
- **Çok uzun (60+ dk):** Ödemeyi tamamlamayan müşteriler, tek kalan ürünü uzun süre kilitler.
- **Önerilen:** 15–30 dakika.

> [!TIP]
> Güvenlik stoğu, sayım hatalarına karşı tampon bırakmak için faydalıdır; özellikle Trendyol gibi bir pazaryerinde de satış yapıyorsanız aynı ürünün iki kanalda birden satılmasını azaltır.

## Takip ve reklam

![Takip ve reklam sekmesi](help/tr/settings-tracking.png)

Burada tarayıcı tarafı ölçüm kimliklerini girer ve çerez onayı davranışını belirlersiniz. Sunucu tarafı gizli anahtarlar (GA4 API gizli anahtarı, Meta erişim jetonu) bu sayfaya değil **Entegrasyonlar** ekranına girilir. Ayrıntılı kurulum için [Analitik ve reklam](/help/analytics) bölümüne bakın.

| Bölüm | Alan | Ne yazılır | Örnek |
|---|---|---|---|
| **Tarayıcı takip kimlikleri** | **GA4 Ölçüm Kimliği** | Google Analytics 4 veri akışı kimliği ([ölçüm kimliği](term:measurementid)) | `G-AB12CD34EF` |
| | **Google Tag Manager Kimliği** | İsteğe bağlı kapsayıcı kimliği ([GTM](term:gtm)) | `GTM-ABC1234` |
| | **Meta Pixel Kimliği** | Yalnızca rakamlar, 5–20 hane ([Meta Pixel](term:pixel)) | `123456789012345` |
| **Onay ve test** | **Takipten önce onay iste** | Ziyaretçi izin verene kadar hiçbir betik yüklenmez ([çerez onayı](term:consent)) | Açık |
| | **Test olayı modu (Meta)** | Sunucu olaylarını Meta'nın Test Events sekmesine gönderir | Kapalı |
| | **Meta test olayı kodu** | Events Manager → Test events'teki kod ([test olay kodu](term:testeventcode)) | `TEST12345` |

Sayfanın altında iki düğme (**GA4'ü yapılandır**, **Meta'yı yapılandır**) sizi doğrudan ilgili entegrasyon çekmecesine götürür. **Son pazarlama olayları** tablosunda sunucu tarafında gönderilen olayların durumu (gönderildi, hata, onay olmadığı için atlandı) listelenir.

> [!WARNING]
> **Takipten önce onay iste** seçeneğini kapatmak, ziyaretçi izni olmadan izleyici yüklemek anlamına gelir. Türkiye ve AB mevzuatında bu genellikle izin gerektirir. Kapatmadan önce hukuki destek alın.

> [!NOTE]
> Meta sunucu tarafı olaylarında kullanılan test kodu, **Meta** entegrasyon çekmecesindeki **Test olayı kodu** alanından okunur. Test ederken kodu hem burada hem de çekmecede girin; yayına geçmeden önce ikisini de temizleyin. Ayrıntı: [Meta Pixel ve Dönüşüm API](/help/integrations#meta-pixel-ve-donusum-api).

## Bildirimler

![Bildirimler sekmesi](help/tr/settings-notifications.png)

OpenShelf yalnızca **işlemsel** mesajlar gönderir: sipariş durumuyla ilgili e-posta ve SMS. Pazarlama veya toplu mesaj yoktur. Mesajlar yalnızca siparişin kendi e-posta adresine ve telefonuna gider; serbest alıcı girişi yoktur.

Bir kanalın çalışması için sağlayıcısının **Entegrasyonlar** ekranında açık olması gerekir (SMS için [Netgsm](/help/integrations#netgsm) veya [Twilio](/help/integrations#twilio), e-posta için [Cloudflare E-posta](/help/integrations#cloudflare-e-posta)). Deneme modunda mesajlar **Mock gelen kutusu**'na düşer.

### Olay ve kanal seçimi

**Olay başına kanallar** tablosunda her olay için **SMS** ve **E-posta** kutularını işaretlersiniz. Varsayılan: e-posta açık, SMS kapalı.

| Olay | Kime gider | Ne zaman tetiklenir |
|---|---|---|
| **Sipariş ödendi (müşteriye)** | Müşteri | Ödeme doğrulandığında |
| **Sipariş kargolandı** | Müşteri | Durumu **Kargoya verildi** yaptığınızda; takip numarası mesaja eklenir |
| **Sipariş teslim edildi** | Müşteri | Durumu **Teslim edildi** yaptığınızda |
| **Sipariş iptal edildi** | Müşteri | Ödenmiş bir siparişi iptal ettiğinizde |
| **Sipariş iade edildi** | Müşteri | Tam iade tamamlandığında |
| **Yeni sipariş (yöneticiye)** | Siz | Ödeme alındığında; **Yönetici e-postası** ve **Yönetici telefonu**'na |

Ödeme yapılmadan önce iptal edilen siparişlerde müşteriye mesaj gitmez (sessiz iptal).

### Gönderen ve yönetici alıcısı

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Gönderen adı** | E-postalarda görünen ad | Seramik Atölyesi | Boşsa mağaza adı kullanılır. |
| **Gönderen e-posta** | E-postaların gönderen adresi | siparis@magazaniz.com | Alan adı Cloudflare Email Sending'e eklenmiş ve DNS kayıtları doğrulanmış olmalıdır; yoksa Cloudflare adresi reddeder. Bu alan, Cloudflare E-posta kartındaki varsayılan adresi geçersiz kılar. |
| **SMS gönderen adı** | SMS'te gönderen başlığı, en fazla 11 karakter | MAGAZAM | Netgsm'de hesabınıza kayıtlı başlık olmalıdır; doluysa sağlayıcının kendi ayarının yerine bu kullanılır. Bkz. [SMS başlığı](term:smsheader). |
| **Yönetici e-postası** | "Yeni sipariş" e-postasının alıcısı | siz@magazaniz.com | |
| **Yönetici telefonu (E.164)** | "Yeni sipariş" SMS'inin alıcısı | +905301234567 | Başında `+` ve ülke kodu olmalıdır ([E.164](term:e164)). |

### Maliyet ve kötüye kullanım korumaları

| Alan | Anlamı | Varsayılan |
|---|---|---|
| **SMS gönderilebilecek ülkeler** | SMS yalnızca bu ülke kodlarına gider (`+90, DE` gibi, virgülle ayrılır). Diğer ülkelere gidecek SMS "ülkeye izin verilmedi" diye atlanır. Boş bırakırsanız hiçbir SMS gitmez. | `+90` |
| **Telefon başına günlük en fazla SMS** | Aynı numaraya son 24 saatte gönderilecek toplam SMS sınırı (tüm olaylar). 0 = sınırsız. | 3 |
| **Adres başına günlük en fazla e-posta** | Aynı adrese son 24 saatte gönderilecek e-posta sınırı. 0 = sınırsız. | 5 |

Yönetici bildirimleri bu günlük sınırlara takılmaz. Türkiye yerel biçimindeki numaralar (`05301234567`) otomatik `+90…` biçimine çevrilir.

### Şablonlar

1. **Şablonlar** kartında **Şablon dili** (Türkçe/İngilizce) ve **Olay**'ı seçin.
2. **E-posta konusu** ve **Mesaj metni (SMS ve e-posta içeriği)**'ni yazın. Gövde hem SMS metni hem e-posta gövdesi olarak kullanılır (e-postada otomatik biçimlendirilir). En fazla 2000 karakter.
3. Aşağıdaki değişken düğmelerine tıklayarak imlecin olduğu yere ekleyin:

| Değişken | Yerine ne gelir |
|---|---|
| `{{orderNumber}}` | Sipariş numarası (DEMO-1004 gibi) |
| `{{customerName}}` | Müşterinin adı soyadı |
| `{{total}}` | Sipariş tutarı (₺ ile biçimlendirilir) |
| `{{trackingNumber}}` | Kargo takip numarası (yalnızca kargolandı olayında) |
| `{{trackingUrl}}` | Takip bağlantısı |
| `{{storeName}}` | Mağaza adı |
| `{{orderUrl}}` | Müşterinin sipariş sayfası bağlantısı |

4. Yalnızca yukarıdaki değişkenler çalışır. Bilinmeyen bir değişken yazarsanız ("Bilinmeyen değişkenler" uyarısı çıkar) mesajda boş görünür. Bkz. [şablon değişkeni](term:templatevar).
5. Boş bıraktığınız şablonlar yerleşik varsayılana döner. **Varsayılana dön** düğmesi seçili şablonu fabrika metnine geri alır.
6. **Canlı önizleme (örnek veri)** bölümünde SMS ve e-postanın nasıl görüneceğini kontrol edin.

**SMS parçası ve maliyet:** Önizlemenin altında karakter sayısı, kodlama (GSM-7 veya UCS-2) ve parça sayısı yazar. Türkçe karakterler (ç, ğ, ı, ş) mesajı UCS-2'ye çevirir; bu durumda tek SMS 160 yerine yaklaşık 70 karakterdir ve uzun mesajlar birden fazla parçaya bölünüp **daha pahalı** olur. SMS şablonlarını kısa tutun.

### Deneme mesajı gönderme

1. **Deneme mesajı gönder** kartında **Kanal** (E-posta/SMS) seçin.
2. Alıcıyı yazın (kendi e-posta adresiniz veya `+90…` telefonunuz).
3. **Deneme gönder**'e basın. Mesaj "[TEST]" etiketiyle gönderilir.
4. Gönderen bilgilerini değiştirdiyseniz önce kaydedin.

Test gönderimi saatte yönetici başına 5, bağlantı adresi başına 10 ile sınırlıdır. O kanal için etkin sağlayıcı yoksa ("sağlayıcı yok") hata alırsınız.

### Sık yapılan hatalar

- **Sağlayıcıyı açmadan kanalı işaretlemek:** Mesaj gitmez; sipariş sayfasındaki bildirim geçmişinde "Atlandı" görünür.
- **Gönderen e-posta alan adı doğrulanmamış:** Cloudflare reddeder. DNS doğrulamasını tamamlayın.
- **Cloudflare Free planında herkese e-posta göndermeyi beklemek:** Free planda yalnızca doğrulanmış hedef adreslere teslim edilir. Bkz. [Cloudflare E-posta](/help/integrations#cloudflare-e-posta).
- **SMS şablonunda Türkçe karakter ve uzun metin:** Maliyet birkaç katına çıkar.
- **Ülke izin listesine yabancı numara eklemeden SMS beklemek.**
- **Gönderilen bildirimleri izlemek için** ilgili siparişin sayfasındaki **Bildirimler** kartına bakın; her kanal için Gönderildi/Başarısız/Atlandı durumunu görürsünüz.

## Sistem

![Sistem sekmesi](help/tr/settings-system.png)

Bu sekmede tek ayar vardır: **Deneme (mock) modu**. Açıldığında tüm dış servisler (iyzico, Geliver, e-Faturam, Trendyol, Meta, GA4, SMS, e-posta) çevrimdışı bir taklitle değiştirilir. Kimse gerçek ödeme yapmaz; fatura, etiket, SMS ve e-postalar **Mock gelen kutusu**'na yazılır.

- Yalnızca **mağaza sahibi** değiştirebilir.
- Yayındaki Worker'da `ALLOW_MOCK=true` değişkeni yoksa anahtar pasiftir ve nedenini açıklayan bir uyarı gösterir.
- Gerçek bir ödeme sağlayıcısı açıkken ya da gerçek ödenmiş siparişler varken açılamaz.
- Anahtara basınca bir onay penceresi çıkar. Açarken: "Tüm entegrasyonlar taklit edilecek…". Kapatırken: "Gerçek entegrasyonlar kayıtlı anahtarlarla yeniden kullanılacak. Ödenmemiş mock siparişleri sonradan tamamlanamaz."

Adım adım anlatım, güvenlik kuralları ve demo turu için [Başlarken → Deneme modu](/help/getting-started#deneme-modu) bölümüne bakın.

> [!DANGER]
> Gerçek müşterilerle çalışan bir mağazada **Deneme (mock) modu açık olmamalıdır**. Yayına geçmeden önce kapatın ve `ALLOW_MOCK` değişkenini kaldırın. Kontrol listesi: [Yayına geçiş](/help/going-live#mock-u-kapatma).
