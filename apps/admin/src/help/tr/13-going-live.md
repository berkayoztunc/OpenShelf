# Yayına alma

Bu bölümde mağazanızı deneme aşamasından gerçek müşterilere açmadan önce yapmanız gerekenleri, sırasıyla ve ayrıntılı olarak öğreneceksiniz: alan adı bağlama, adresleri sabitleme, gizli anahtarlar ve canlı ortam, deneme modunu kapatma, deneme siparişi, yasal metinler ve maliyetlerin nasıl işlediği. Bu sayfayı yayına almadan önce baştan sona bir kez uygulayın.

> [!WARNING]
> Yayına alma, gerçek para ve gerçek müşteri verisi demektir. Acele etmeyin. Aşağıdaki listeyi yukarıdan aşağıya tamamlayın ve her adımı işaretleyin. Bu bölüm hukuki veya mali danışmanlık değildir.

## Yayın kontrol listesi

Kısa özet; her madde aşağıdaki başlıklarda ayrıntılıdır.

| # | Kontrol | Neden önemli | Nerede |
|---|---|---|---|
| 1 | Kendi [alan adınız](term:domain) bağlı ve `https://` ile açılıyor | Müşteri güvenilir bir adres görür; paylaşım önizlemeleri çalışır | [Alan adı](#alan-adi) |
| 2 | Adresler (Storefront / Admin / API) sabitlendi | Yanlış sitelerden gelen isteklere karşı sıkı koruma | [Alan adı](#alan-adi) |
| 3 | Geçici `workers.dev` ve önizleme adresleri kapatıldı | Aynı mağazaya ikinci bir (arama motorunda çıkabilen) kapı kalmasın | [Alan adı](#alan-adi) |
| 4 | Gizli anahtarlar tamam ve sağlam saklandı | Anahtar kaybı entegrasyonları durdurur | [Gizli anahtarlar ve ortam](#gizli-anahtarlar-ve-ortam) |
| 5 | `ALLOW_MOCK` kaldırıldı, **Deneme modu kapalı** | Müşteri sahte ödeme sayfası görmesin | [Mock'u kapatma](#mock-u-kapatma) |
| 6 | Tüm entegrasyonlar **Canlı** ortamda ve canlı anahtarlarla | Sandbox'ta ödeme gerçek olmaz | [Gizli anahtarlar ve ortam](#gizli-anahtarlar-ve-ortam) |
| 7 | Gerçek deneme siparişi verildi, gerçek iadesi yapıldı | Her halkanın çalıştığını görmek için | [Deneme siparişi](#deneme-siparisi) |
| 8 | İki adımlı doğrulama açık; ekip rolleri doğru | Hesap güvenliği | [Güvenlik](/help/security#iki-adimli-dogrulama) |
| 9 | Beş yasal metin yazıldı, hukukçuya kontrol ettirildi | Yasal yükümlülükler | [Müşteriler ve KVKK](/help/customers-kvkk#kvkk-ve-anonimlestirme) |
| 10 | Arama motoru anahtarı **açık** | Aksi hâlde Google'da görünmezsiniz | [SEO](/help/seo#canonical-ve-noindex) |
| 11 | Analitik test kodu silindi, çerez onayı açık | Reklam verisi doğru aksın | [Analitik](/help/analytics#test-etme) |
| 12 | Bildirim şablonları, SMS başlığı ve e-posta gönderen adresi doğru | Müşteri doğru mesaj alsın | [Bildirimler](/help/store-settings#bildirimler) |
| 13 | Yedek alındı ve test edildi | Beklenmedik duruma hazırlık | [Yedekleme](/help/data#yedekleme) |
| 14 | Maliyetler ve bütçe uyarısı gözden geçirildi | Sürpriz fatura olmasın | [Maliyetler](#maliyetler) |

## Alan adı

Müşterileriniz mağazaya `magazaniz.com` gibi kendi adresinizle ulaşmalı. Başlangıçta mağaza `...workers.dev` biçimli geçici bir adreste açılır; bu adres deneme içindir.

### Alan adı bağlama

**Başlamadan önce:** Bir alan adı satın almış olmalısınız ve alan adı Cloudflare DNS'inde olmalı ([DNS](term:dns) kayıtlarını Cloudflare yönetmeli). Alan adı henüz Cloudflare'de değilse Cloudflare panelinde "Alan adı ekle" ile ekleyip, kayıt firmanızdaki isim sunucularını Cloudflare'in verdikleriyle değiştirin; bu işlem birkaç saat sürebilir.

1. Cloudflare panelinde **Workers & Pages** bölümünden mağazanızın Worker'ını seçin ([Worker](term:worker)).
2. **Settings → Domains & Routes** bölümüne gidin.
3. **Add** ile alan adınızı ekleyin (örneğin `magazaniz.com` ve isterseniz `www.magazaniz.com`).
4. Birkaç dakika bekleyin; adres `https://` ile açılmalı. Güvenlik sertifikası (SSL / HTTPS) Cloudflare tarafından otomatik sağlanır ([SSL / HTTPS](term:ssl)).
5. Tarayıcıda `https://magazaniz.com` ve `https://magazaniz.com/admin/` adreslerini açıp giriş yapabildiğinizi doğrulayın.

Not: Cloudflare panelinin menü adları zamanla değişebilir; aşağıdaki Cloudflare belgesi güncel yolu gösterir: Workers → Custom Domains. Yapılandırmada ek bir değişiklik gerekmez; mağaza adresleri gelen isteğin adresinden otomatik türetilir. Yönetim paneli güvenlik çerezi **yalnızca HTTPS** ile çalışır.

> [!NOTE]
> DNS değişiklikleri dünyaya yayılırken birkaç dakikadan birkaç saate kadar sürebilir; bu sürede bazı ziyaretçiler siteyi açamayabilir. Alan adını yoğun saatlerde değil, sakin bir zamanda bağlayın.

### Adresleri sabitleme

Varsayılan olarak mağaza, panel ve API adresleri gelen isteğin adresinden otomatik belirlenir. **Üretimde bunları üç değişkenle sabitlemeniz önerilir:**

| Değişken | Değer | Örnek |
|---|---|---|
| `STOREFRONT_ORIGIN` | Vitrin adresi | `https://magazaniz.com` |
| `ADMIN_ORIGIN` | Panel adresi (aynı adres) | `https://magazaniz.com` |
| `API_ORIGIN` | API adresi (aynı adres) | `https://magazaniz.com` |

1. Cloudflare panelinde Worker'ınızın **Settings → Variables and Secrets** bölümüne gidin (veya `wrangler.jsonc` dosyasındaki `vars` alanını kullanın).
2. Üç değişkeni **tam olarak** `https://` ile başlayan, sonunda eğik çizgi olmayan adres olarak ekleyin.
3. Kaydedin ve yayınlayın (deploy).
4. Panele yeniden girip bir ayar kaydetmeyi deneyin.

> [!WARNING]
> Adresi sabitledikten sonra panele **farklı bir adresten** (örneğin eski `workers.dev` adresinden) girerseniz değiştirme işlemleri "Origin not allowed" hatası verir ve CORS reddedilir. Bu bir hata değil, korumadır. Adresi sonradan değiştirirseniz üç değişkeni de güncelleyin. Çözüm için [Giriş sorunları](/help/troubleshooting#giris-sorunlari) bölümüne bakın.

### Geçici adresleri kapatma

Mağazanıza hem `magazaniz.com` hem de `...workers.dev` adresiyle erişilebilir. İkincisinin arama motorunda ikinci bir kopya olarak çıkmaması ve panelin yanlış adresten açılmaması için kapatın.

* Cloudflare panelinde Worker'ın **Settings → Domains & Routes** bölümünde `workers.dev` adresini ve (varsa) **Preview URLs** (önizleme adresleri) seçeneğini devre dışı bırakın.
* Yapılandırma dosyasıyla yönetiyorsanız `wrangler.jsonc` içinde `workers_dev` ve `preview_urls` ayarlarının kapatılması aynı sonucu verir (doğrulanacak: güncel Wrangler yapılandırma belgesi).
* Kapatmadan önce **özel alan adınızdan** panele giriş yapabildiğinizden emin olun; aksi hâlde kendinizi dışarıda bırakabilirsiniz.

> [!TIP]
> `workers.dev` adresini hemen kapatmak yerine, önce yeni adresten bir gün sorunsuz çalıştığını görün, sonra kapatın.

## Gizli anahtarlar ve ortam

İki çeşit "gizli şey" vardır:

| Ne | Nerede tutulur | Sizin işiniz |
|---|---|---|
| **Sunucu sırları**: `APP_ENCRYPTION_KEY`, `SETUP_TOKEN`, isteğe bağlı `TURNSTILE_SECRET` | Cloudflare Worker'ın gizli depolama alanı | Kurulumda bir kez girilir; güvenli bir yere yedeğini alın |
| **Entegrasyon anahtarları**: iyzico, Trendyol, Geliver, Netgsm... | Panel → **Entegrasyonlar**; veritabanında şifreli | Sağlayıcı panelinden alıp girersiniz |

### Sunucu sırları

* `APP_ENCRYPTION_KEY`: Entegrasyon anahtarlarını şifreleyen ana anahtardır. Kaybederseniz entegrasyon anahtarlarının hepsini yeniden girmeniz gerekir. Parola yöneticinizde saklayın; kimseyle paylaşmayın. Bkz. [Gizli anahtarlar](/help/security#gizli-anahtarlar).
* `SETUP_TOKEN`: İlk sahibi oluşturmak için tek kullanımlık koddur. Mağaza sahibi hesabı oluştuktan sonra kullanılamaz.
* `TURNSTILE_SECRET`: Giriş robot doğrulaması içindir ([Turnstile](term:turnstile)); isteğe bağlıdır.
* Entegrasyon anahtarları Worker sırrı **değildir**; panelden girilir.

### Canlı ortam

Birçok entegrasyonda deneme (Sandbox) ve canlı ortamı farklı anahtarlarla çalışır. Yayına almadan önce **her** entegrasyonu gözden geçirin ([canlı ortam](term:production)):

| Entegrasyon | Kontrol |
|---|---|
| iyzico | **Ortam: Canlı**; canlı API anahtarı ve gizli anahtar; iyzico mağaza hesabınızın onaylı olduğundan emin olun |
| Geliver (kargo) | **Test modu** kapalı (test modunda gönderiler gerçek değildir); gönderici adres kimliği doğru |
| Trendyol e-Faturam | Servis adresi ve kullanıcı bilgisi canlı hesabınıza ait; e-Fatura / e-Arşiv seri ön ekleri kontrol edildi |
| Trendyol Marketplace | Satıcı kimliği ve anahtarlar doğru |
| Netgsm / Twilio | SMS başlığı sağlayıcıda **onaylı**; ülke izin listesi ve günlük sınırlar uygun |
| Cloudflare E-posta | Gönderen alan adı Cloudflare'de doğrulanmış; Workers Paid gerekebilir (aşağıya bakın) |
| Meta / Google Analytics 4 | Gerçek Pixel ve ölçüm kimliği; **test olayı kodu silindi** |

Her kartta **Bağlantıyı sına** düğmesine basın. Sınama yetmez; gerçek bir deneme siparişi şarttır.

> [!WARNING]
> Sandbox anahtarlarıyla canlı mağaza açmak, müşterinin "ödedim" sanıp paranın hiç hareket etmemesine yol açabilir. Her entegrasyonun ortamını gözle kontrol edin.

![Entegrasyonlar sayfası](help/tr/integrations-hub.png)

## Mock'u kapatma

[Deneme modu (mock)](term:mock), tüm dış hizmetleri (ödeme, SMS, e-posta, fatura, kargo, analitik) çevrimdışı sahte bir benzetimle değiştirir. Müşteriler sahte bir ödeme sayfası görür ve hiç para hareket etmez. Gerçek müşteri alırken **mutlaka kapalı** olmalıdır.

Yayına almadan önce:

1. Mağaza sahibi olarak **Mağaza ayarları → Sistem** sekmesine gidin.
2. **Deneme modu (demo)** anahtarını kapatın ve açılan onay penceresini onaylayın.
3. Kenar çubuğundaki **Mock gelen kutusu** girişinin kaybolduğunu doğrulayın.
4. Cloudflare panelinde Worker'ın **Variables and Secrets** bölümünden `ALLOW_MOCK` değişkenini **silin** (yoksa zaten kapalıdır). Bu değişken olmadan canlı sitede deneme modu hiç açılamaz; yanlışlıkla açılmasına karşı en güvenli önlemdir.
5. Siteyi yayınlayın (deploy) ve vitrinde bir ürünü sepete atıp ödeme adımına gidin: ödeme sayfası **sahte değil, iyzico sayfası** olmalı.

![Sistem sekmesi](help/tr/settings-system.png)

Deneme modu hakkındaki kurallar:

* Yalnızca **mağaza sahibi** açıp kapatabilir.
* Sunucuda `ALLOW_MOCK` tanımlı değilse deneme modu açılamaz; panel bunu bir uyarı ile belirtir.
* Gerçek bir ödeme sağlayıcı (iyzico) açıkken veya gerçek ödenmiş siparişler varken deneme modu açılamaz. Hatalar için [Sorun giderme](/help/troubleshooting#sss).
* Deneme modunda ödenmiş siparişler **sahte ödemelidir**; deneme modu kapatıldığında bunlar iade edilemez ve ödenmemiş sahte siparişler tamamlanamaz.
* Kapatmadan önce deneme verilerini (sahte siparişler, test müşterileri) temizlemek isteyebilirsiniz; ürünleri ve ayarları olduğu gibi tutabilirsiniz.

> [!DANGER]
> Deneme modu açıkken gelen "siparişler" için müşteriden **hiç para alınmaz**. Yayına almayı unutup deneme modunu açık bırakırsanız müşteriler ürün almış gibi görünür ama ödeme yapmamış olur. Bu, en pahalı yayın hatasıdır.

## Deneme siparişi

Yayına almadan önce **kendi kartınızla gerçek bir sipariş** verin ve her halkayı doğrulayın.

1. Küçük bir tutarlı gerçek bir ürün seçin (veya düşük fiyatlı bir test ürünü oluşturun).
2. Vitrinde sepete ekleyip ödeme yapın.
3. Panelde **Siparişler**'de siparişin **Ödendi** durumuna geçtiğini görün.
4. Müşteri e-postasının ve (açıksa) SMS'in geldiğini, doğru Türkçe karakterlerle ve doğru adla gönderildiğini doğrulayın.
5. Faturanın kesildiğini (veya elle kesebildiğinizi) ve doğru KDV oranıyla çıktığını kontrol edin.
6. Kargo etiketi oluşturmayı (Geliver) deneyin.
7. Analitikte satın alma olayının geldiğini kontrol edin ([Analitik: test etme](/help/analytics#test-etme)).
8. Siparişi **iade edin** ve paranın kartınıza döndüğünü doğrulayın ([İade](/help/orders#iade)).
9. Deneme siparişini iptal/iade edip stoku düzeltin.

> [!NOTE]
> Test için gerçek ödeme yaptığınızda ödeme kuruluşu komisyon keser ve iade sonrası bile bir kısmı geri dönmeyebilir. Bu tutarlar küçüktür ama bilin.

## Maliyetler

OpenShelf'in kendisi ücretsiz bir yazılımdır, ancak üzerinde çalıştığı ve kullandığı hizmetlerin maliyeti olabilir. Bu bilgi bir söz değil, rehberdir.

> [!WARNING]
> **"Sonsuza kadar ücretsiz" diye bir söz vermiyoruz.** Cloudflare ve diğer sağlayıcılar limitlerini ve fiyatlarını istedikleri zaman değiştirebilir. Çekirdek sistemin (Worker, D1 veritabanı, statik dosyalar) küçük bir mağaza için Cloudflare'in ücretsiz planlarına sığacak biçimde tasarlandığını biliyoruz; bu bir tasarım hedefidir, garanti değildir.

| Kalem | Durum | Not |
|---|---|---|
| Cloudflare Workers ve D1 | Çoğu küçük mağaza için ücretsiz planlara sığması hedeflenir | Trafik, ürün sayısı, sipariş hacmi arttıkça limit aşılabilir; limitler Cloudflare tarafından belirlenir ve değişebilir |
| Her dakika çalışan arka plan görevi ([cron](term:cron)) | Varsayılan olarak her dakika | Ücretsiz limitlere takılırsanız sıklığı düşürmek mümkündür (örneğin 5 dakikada bir); bunun bedeli e-posta/fatura yeniden denemelerinin ve stok rezervasyonu süresinin dolmasının yavaşlamasıdır |
| R2 (görsel depolama) | İsteğe bağlı, ücretli eklenti olabilir | Kullanmazsanız görseller veritabanında saklanır; R2 için ödeme yöntemi gerekebilir |
| Queues | İsteğe bağlı, ücretli olabilir | Çekirdek için şart değil |
| Cloudflare E-posta Hizmeti | **Beta**; rastgele alıcılara göndermek için **Workers Paid** planı gerekebilir | Ücretsiz planda yalnızca doğrulanmış adreslere gönderilebilir; alan adı doğrulaması gerekir |
| Alan adı | Yıllık ücret | Kayıt firmasına ödenir |
| SMS (Netgsm, Twilio) | Mesaj başına ücret | Türkçe karakterli mesajlar daha kısa parçalara bölünür ve daha pahalıdır |
| iyzico, kargo, e-Fatura, Trendyol | Kendi komisyon ve ücretleri | Sözleşmenize bakın |

Maliyeti kontrol altında tutmak için:

1. Cloudflare hesabınızda **fatura/kullanım uyarıları** kurun.
2. Cloudflare'in güncel limit sayfalarına bakın: Workers ve D1 limitleri ([Workers limitleri](https://developers.cloudflare.com/workers/platform/limits/), [D1 limitleri](https://developers.cloudflare.com/d1/platform/limits/)).
3. [Bildirimler](/help/store-settings#bildirimler) ayarlarında SMS için ülke izin listesini ve alıcı başına günlük sınırları kısıtlı tutun; bu hem istismarı hem maliyeti sınırlar.
4. SMS'i gerçekten gerekmedikçe açmayın; e-posta çoğu müşteri için yeterlidir.
5. Büyüdükçe kullanım raporlarına ayda bir bakın.

## Güncelleme ve sonrası

* Yeni sürüm yüklemeden önce **veri yedeği alın** ([Yedekleme](/help/data#yedekleme)).
* Yayından sonraki ilk haftada günde bir **Siparişler**, **Entegrasyon olayları** ve **E-postalar** sayfalarına bakın; başarısız işler varsa bkz. [Sorun giderme](/help/troubleshooting).
* Sorun yaşarsanız önce panelde **Sistem** sekmesindeki durumu ve Entegrasyon olaylarını kontrol edin.

## Sık yapılan hatalar

* **Deneme modunu kapatmayı unutmak.** (Yukarıdaki tehlike kutusu.)
* **Arama motoru anahtarını açmayı unutmak.** Mağaza Google'da hiç görünmez.
* **Sandbox anahtarlarıyla yayına çıkmak.**
* **Sabitlediğiniz adresten farklı bir adresle panele girmeye çalışmak.**
* **Meta test olayı kodunu silmemek.**
* **Yasal metinleri boş bırakmak** veya şablonu hiç değiştirmeden yayınlamak.
* **`APP_ENCRYPTION_KEY` değerini hiçbir yerde saklamamak.**
* **Gerçek bir deneme siparişi vermeden yayına çıkmak.**
* **Maliyetlerin sabit kalacağını varsaymak.** Limitleri ve faturayı düzenli izleyin.
