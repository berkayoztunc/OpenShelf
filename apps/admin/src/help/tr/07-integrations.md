# Entegrasyonlar

Bu bölümde OpenShelf'in dış servislerle nasıl konuştuğunu öğrenirsiniz: ödeme (iyzico), pazaryeri (Trendyol), kargo (Geliver), fatura (e-Faturam), reklam ve analitik (Meta, Google Analytics 4), SMS (Netgsm, Twilio) ve e-posta (Cloudflare E-posta). Her sağlayıcı için ne işe yaradığını, hangi hesabın gerektiğini, anahtarların nereden alınacağını, hangi alana yazılacağını, nasıl test edileceğini, canlıya nasıl geçileceğini ve en sık görülen hataları bulacaksınız.

> [!WARNING]
> Bu entegrasyonların hepsi sağlayıcıların herkese açık belgelerine göre yazılmış ve sahte (mock) sağlayıcılarla sınanmıştır; **canlı hesaplarla doğrulanmamıştır**. Özellikle Trendyol ve e-Faturam için uç noktaların bir kısmı **doğrulanmamıştır** (aşağıda ayrıca belirtilir). Gerçek para, fatura veya müşteri verisi akıtmadan önce her entegrasyonu kendi hesabınızla küçük ölçekte deneyin. Ücretler ve limitler sağlayıcılara aittir ve değişebilir; "ücretsiz" iddiası taşımayın.

## Entegrasyonları test etme

Sol menüden **Entegrasyonlar**'a tıklayın. Her sağlayıcı bir kart olarak görünür.

![Entegrasyonlar sayfası](help/tr/integrations-hub.png)

**Özet** şeridi kaç entegrasyonun **bağlı** olduğunu, sağlıklı olanları ve son test zamanını gösterir. **Tümünü test et** düğmesi etkin olan hepsini sırayla dener. **Kurulum kontrol listesi** yeni bir mağazanın ihtiyaç duyduğu başlıkları (ödeme, kargo, fatura, e-posta, SMS, analitik) ve sıradaki adımı gösterir. Üstteki filtre düğmeleri ve arama kutusu kartları daraltır.

### Kart üzerindeki öğeler

| Öğe | Anlamı |
|---|---|
| Sağ üstteki anahtar | Entegrasyonu **açar/kapatır**. Kapalı entegrasyon asla çağrılmaz. |
| Durum rozeti | **Yapılandırılmadı** (zorunlu alanlar eksik), **Yapılandırıldı** (alanlar dolu, henüz test edilmedi), **Bağlı** (son test başarılı), **Hata** (son test başarısız), **MOCK** (deneme modu) |
| **Yapılandır** | Sağdan çekmeceyi açar: alanları doldurduğunuz yer |
| **Bağlantıyı test et** | Sağlayıcıya gerçek bir bağlantı denemesi yapar. Alanlar eksikse pasiftir. |
| **Olayları gör** | O sağlayıcının **Entegrasyon olayları** kayıtlarını açar |

### Yapılandırma çekmecesi (her sağlayıcı için aynı)

![Entegrasyon yapılandırma çekmecesi](help/tr/integration-drawer.png)

1. Kartta **Yapılandır**'a tıklayın.
2. **Etkin** anahtarı ile entegrasyonu açın.
3. Herkese açık alanları (ortam, kimlikler) doldurun.
4. Gizli alanlara ([API anahtarı](term:apikey), [gizli anahtar](term:secret)) değerleri yapıştırın. Gizli alanlar **yazma-yalnızdır**: kaydedildikten sonra bir daha gösterilmez, yalnızca maskeli görünür. Alanı boş bırakırsanız mevcut değer korunur; değiştirmek için yeni değer yazın.
5. **Kaydet**'e basın. Değer **şifreli** saklanır.
6. **Bağlantıyı test et**'e basın. Kaydedilmemiş değişiklik varsa test düğmesi pasiftir ("Önce değişiklikleri kaydedin").
7. Sonucu çekmecedeki panelde ve karttaki rozette görün.

Zorunlu alanlar yalnızca entegrasyonu **açarken** kontrol edilir; taslak olarak yarım kaydedebilirsiniz. Deneme modundayken çekmecede "kaydetme devre dışı" uyarısı çıkar; gerçek anahtarlar yok sayılır, ancak test çalışır.

### Entegrasyon olayları

**Entegrasyon olayları** sayfası sağlayıcı çağrılarının günlüğüdür: başarı, uyarı ve hatalar. Bir şey çalışmıyorsa ilk bakacağınız yer burasıdır.

![Entegrasyon olayları](help/tr/integration-events.png)

Arka plan işlerinin ([outbox](term:outbox)) durumları: **Sırada**, **Çalışıyor**, **Tamamlandı**, **Hata (yeniden denenecek)**, **Başarısız (vazgeçildi)**.

### Genel kurallar

- **Her entegrasyonu önce sandbox/test ortamında deneyin** ([sandbox](term:sandbox)).
- Anahtarları e-postayla veya mesajlaşma uygulamasıyla paylaşmayın; parola yöneticisinde saklayın.
- Test başarılı olsa bile gerçek bir sipariş/etiket/fatura/SMS ile uçtan uca deneyin.
- Sağlayıcıyı değiştirirken eskisini kapatın; aynı türde birden fazla sağlayıcı açıksa ilki kullanılır.
- Genel bakıştaki **Entegrasyon sağlığı** kartını düzenli izleyin.

## iyzico

**Ne işe yarar:** Kredi kartı ödemesi alır. Müşteri iyzico'nun barındırdığı ödeme sayfasında ([hosted checkout](term:hostedcheckout)) öder; kart bilgisi OpenShelf'e uğramaz. Sistem ödeme sonucunu imza ve sunucudan sorgu ile doğrular, iade işlemini sipariş sayfasından yapar.

**Ne gerekir:** Onaylı bir iyzico **üye işyeri** hesabı. Başvuru ve onay süreci iyzico'ya aittir.

### Anahtarlar nereden alınır?

1. iyzico üye işyeri paneline girin.
2. **Ayarlar** (veya Entegrasyon/API bilgileri) bölümünde **API anahtarı** ve **Gizli anahtar**'ı bulun. Sandbox ve canlı için **ayrı** anahtar çiftleri vardır; sandbox için ayrı bir sandbox üye işyeri hesabı açmanız istenebilir (iyzico'nun güncel belgesine bakın).
3. İkisini de kopyalayın.

### Hangi alana yazılır?

**Entegrasyonlar → iyzico → Yapılandır**:

| Alan | Ne yazılır | Dikkat |
|---|---|---|
| **Ortam** | **Sandbox (test)** veya **Canlı** | Sandbox'ta `sandbox-api.iyzipay.com`, canlıda `api.iyzipay.com` kullanılır. Anahtarlar ortamla eşleşmelidir. |
| **Taksit komisyonuna izin ver** | Taksitli ödemede iyzico tutarı artırırsa kabul edilsin mi | Kapalıyken müşterinin ödediği tutar sipariş tutarından farklıysa ödeme doğrulanmaz. Taksit sunuyorsanız bilerek açın. |
| **API anahtarı (API Key)** (gizli) | Sandbox veya canlı API anahtarı | |
| **Gizli anahtar (Secret Key)** (gizli) | Gizli anahtar | Başkasıyla paylaşmayın. |

**Callback ve webhook adresleri:** Tarayıcı dönüşü `https://magazaniz.com/api/store/payment/callback/iyzico`, bildirim (webhook) adresi `https://magazaniz.com/webhooks/payment/iyzico` biçimindedir. Hesabınız destekliyorsa webhook adresini iyzico panelinde tanımlayın ([webhook](term:webhook)).

### Test ve sandbox

1. Ortamı **Sandbox** yapıp sandbox anahtarlarını girin, **Kaydet**, **Bağlantıyı test et**.
2. Vitrinde bir ürün alın; iyzico'nun yayımladığı **test kartlarıyla** ödeyin (güncel kart numaraları iyzico belgesindedir).
3. Siparişin **Ödendi** olduğunu, ardından küçük bir kısmi **İade**'nin çalıştığını doğrulayın.

### Canlıya geçiş

1. Üye işyeriniz canlı için onaylıdır.
2. **Ortam**'ı **Canlı** yapın ve **canlı** API/Gizli anahtarı girin; kaydedin ve test edin.
3. Gerçek kartla düşük tutarlı bir sipariş verin, iade edin.
4. Mock modunun kapalı olduğundan emin olun ([Yayına geçiş](/help/going-live#mock-u-kapatma)).

### Yaygın hatalar

- Sandbox anahtarını canlı ortamda (veya tersini) kullanmak: "kimlik doğrulama" hatası.
- Tutar uyuşmazlığı: taksit komisyonu veya para birimi farkı; **Taksit komisyonuna izin ver**'e bakın.
- Alıcı kimlik/adres bilgisi eksikliği: iyzico bazı alanları zorunlu isteyebilir; ödeme reddedilirse **Entegrasyon olayları**'na bakın.
- Webhook'un tanımlanmaması: tarayıcı dönüşü çalışır ama müşteri sayfayı kapatırsa ödeme geç görünebilir.

**Maliyet:** Komisyon, taksit ve hesaba geçiş süreleri iyzico sözleşmenize bağlıdır. OpenShelf komisyon almaz.

## Trendyol

**Ne işe yarar:** Stok ve fiyatı Trendyol'a gönderir, Trendyol siparişlerini siparişler listenize alır (yaklaşık her 5 dakikada bir mutabakat), ürünleri SKU/barkod ile eşler ve stok düşümünü kaydeder.

> [!WARNING]
> Trendyol entegrasyonunun uç noktaları (gönderim adresleri, alan adları, sınırlar, durum sözlüğü) **doğrulanmamıştır**. Canlıya geçmeden önce Trendyol'un güncel entegrasyon belgesiyle ve satıcı destek ekibiyle teyit edin. **Trendyol Express veya Trendyol'a özel kargo varsayılmaz ve uygulanmaz.**

**Ne gerekir:** Aktif bir Trendyol satıcı hesabı ve API erişimi.

### Anahtarlar nereden alınır?

1. Trendyol satıcı paneline girin.
2. **Hesap bilgilerim → Entegrasyon bilgileri** (menü adı değişebilir) bölümünü açın.
3. **Satıcı ID (Supplier ID)**, **API Key** ve **API Secret** değerlerini kopyalayın. Bölüm görünmüyorsa Trendyol destekten API yetkisi isteyin.

### Hangi alana yazılır?

**Entegrasyonlar → Trendyol → Yapılandır**:

| Alan | Ne yazılır |
|---|---|
| **Satıcı (Cari) ID** | Satıcı kimliği (rakamlar) |
| **API anahtarı** (gizli) | Trendyol API anahtarı |
| **API gizli anahtarı** (gizli) | Trendyol API gizli anahtarı |
| **Webhook kullanıcı adı (Basic auth)** ve **Webhook parolası** (gizli, isteğe bağlı) | Trendyol webhook kaydı sırasında belirlediğiniz temel kimlik doğrulama bilgisi |

Webhook kullanıyorsanız adresi `https://magazaniz.com/webhooks/trendyol` olarak tanımlayın; kullanmazsanız mutabakat zaten otomatik çalışır.

### Eşleme ve fiyat

1. Ürünlerinizde **SKU** ve **Barkod** Trendyol'daki ile aynı olmalıdır.
2. Varyantta **Trendyol fiyatı**'nı girin ([Kanal fiyatları](/help/catalog#kanal-fiyatlari)).
3. Bu sürümde ürün ekranında "Trendyol'da listele" anahtarı yoktur; stok/fiyat gönderimi, Trendyol kanal listesi kaydı olan varyantlar için çalışır. Gönderimin gerçekleştiğini **Entegrasyon olayları**'ndan ve Trendyol panelinden doğrulayın. Barkodu olmayan varyant gönderilmez.

### Test ve sandbox

Trendyol bazı entegrasyonlar için talep üzerine test (stage) ortamı verebilir; erişim ve adresler Trendyol'a aittir. Yoksa az sayıda gerçek ürünle ve düşük stokla deneyin. **Bağlantıyı test et** ile kimlik bilgilerini sınayın.

### Canlıya geçiş

1. Birkaç ürünle stok gönderimini ve bir deneme siparişi içe aktarmayı doğrulayın.
2. Sipariş sayfasında **Kaynak: Trendyol** siparişlerini ([Trendyol siparişleri](/help/orders#trendyol-siparisleri)) Trendyol panelindeki ile karşılaştırın.
3. Stok sapması olursa **Genel bakış**'taki **Stok sapması** kartını izleyin.

### Yaygın hatalar

- Barkod/SKU uyuşmazlığı: sipariş satırı eşleşmez, stok düşmez.
- Oran sınırları ve kategori/özellik zorunlulukları Trendyol'a aittir; hata **Entegrasyon olayları**'nda görünür.
- Aynı siparişi iki yerden faturalamak ([e-Faturam](/help/integrations#e-faturam)).

**Maliyet:** Trendyol komisyonları ve kargo anlaşmaları sizin Trendyol sözleşmenize bağlıdır.

## Geliver

**Ne işe yarar:** Çok kargo firmasından teklif alıp gönderi ve etiket oluşturur, takip eder, gönderiyi iptal eder. Sipariş sayfasındaki **Kargo oluştur** bunu kullanır.

**Ne gerekir:** Bir Geliver hesabı ve en az bir tanımlı gönderici adresi.

### Anahtarlar nereden alınır?

1. Geliver panelinize girin.
2. **API Token**'ınızı oluşturun/kopyalayın (Geliver belgesi: docs.geliver.io).
3. Panelde bir **gönderici adresi** tanımlayın ve adres kimliğini (ID) not alın; isterseniz bir **iade adresi** de tanımlayın.

### Hangi alana yazılır?

**Entegrasyonlar → Geliver → Yapılandır**:

| Alan | Ne yazılır | Dikkat |
|---|---|---|
| **Test modu (ücretsiz test gönderileri)** | Test gönderisi mi | **Varsayılan olarak testtir.** Gerçek kargo için **kapatın**. |
| **Gönderici adres ID (Geliver)** (zorunlu) | Geliver'daki gönderici adres kimliği | Bağlantı testi bu adresi sorgular. |
| **İade adres ID** | İade adresi kimliği | İsteğe bağlı. |
| **Mağaza adresi (URL)** | Mağaza adresiniz | |
| **API anahtarı (Token)** (gizli) | Geliver erişim anahtarı | |

### Test ve canlıya geçiş

1. **Test modu** açıkken **Bağlantıyı test et**, ardından bir deneme siparişinde **Kargo oluştur** ile test gönderisi oluşturun ([Kargo](/help/orders#kargo)).
2. Canlıya geçerken **Test modu**'nu kapatın, gönderici adresini ve ürün ağırlıklarını gözden geçirin.
3. İlk gerçek gönderiyi tek paketle deneyin.

### Yaygın hatalar

- Test modunu canlıda açık bırakmak: etiketler gerçek kargoya iletilmez.
- Yanlış hizmet kodu: **Kargo oluştur** penceresinde Geliver'dan aldığınız teklif hizmet kimliğini yazın.
- Ürün ağırlığı tanımsızsa adet başına 500 g varsayılır; ücret hatalı çıkabilir.
- Webhook doğrulama mekanizması olmadığından takip güncellemelerine güvenmeyin; teslimatı siz **Teslim edildi** yapın.

**Maliyet:** Kargo firmaları, fiyatlar ve kapıda ödeme desteği Geliver sözleşmenize bağlıdır; etiket ücretini kargo firması keser.

## e-Faturam

**Ne işe yarar:** Siparişler için e-Fatura veya e-Arşiv faturası keser (ödeme sonrası otomatik veya manuel), numarayı ve belge bağlantısını saklar, aynı faturayı iki kez kesmez. Ayrıntı: [Faturalar](/help/invoices).

> [!DANGER]
> e-Faturam API ayrıntıları (adresler, kimlik doğrulama biçimi, alan adları) **doğrulanmamıştır**; sağlayıcı belgeleri size aktivasyon e-postasıyla özel olarak iletilir. Gerçek fatura kesmeden önce kendi hesabınızla test etmelisiniz. **Trendyol dışı kanallardan (web siteniz) gelen siparişlerin kapsamı e-Faturam sözleşmenize bağlıdır**; yazılı teyit alın. Mükellefiyetiniz için mali müşavirinize danışın. Bu rehber hukuki tavsiye değildir.

**Ne gerekir:** Trendyol e-Faturam hesabı/sözleşmesi ve size verilen web servisi bilgileri.

### Bilgiler nereden alınır?

1. e-Faturam aktivasyon e-postasını ve belgelerini bulun: **servis adresi**, **kullanıcı adı**, **şifre**.
2. Seri ön eklerinizi (e-Fatura ve e-Arşiv için 3 harf) mali müşavirinizle belirleyin.
3. **Mağaza ayarları → Genel**'de satıcı **Vergi no** ve **Adres**'i girin.

### Hangi alana yazılır?

**Entegrasyonlar → e-Faturam → Yapılandır**:

| Alan | Ne yazılır | Dikkat |
|---|---|---|
| **Servis adresi (URL)** (zorunlu) | Sağlayıcının servis adresi | Güvenlik gereği yalnızca `trendyol.com` alan adları kabul edilir. |
| **Vergi numarasının e-Fatura mükellefi olup olmadığını sorgula** | Müşteri VKN'si e-Fatura mükellefi mi diye sorulsun | Kapalıysa şirket + 10 haneli VKN = e-Fatura varsayılır. |
| **e-Fatura seri öneki (3 harf)**, **e-Arşiv seri öneki (3 harf)** | Seri ön ekleri | İsteğe bağlı. |
| **Kullanıcı adı** (gizli), **Şifre** (gizli) | Servis kimlik bilgileri | |

### Test ve sandbox

e-Faturam test/sandbox hesabı sağlıyorsa onu kullanın; test faturalarının gerçek belge olarak vergi idaresine gitmediğini sağlayıcıdan teyit edin. **Bağlantıyı test et** ile erişimi sınayın, sonra mock modunda akışı deneyin ([Deneme modu](/help/getting-started#deneme-modu)).

### Canlıya geçiş

1. Sözleşmenizin kapsadığı sipariş kaynaklarını ve müşteri türlerini yazılı teyit edin.
2. Tek bir gerçek siparişle manuel fatura kesip e-Faturam panelinde görün.
3. Sonra otomatik faturayı bilerek açık bırakın. Trendyol siparişlerinde çifte fatura riskine dikkat edin.

### Yaygın hatalar

- Yanlış servis URL'si/kimlik bilgisi: fatura **Hata** durumuna düşer.
- Alan adı `trendyol.com` dışında: kayıt reddedilir.
- Müşteri bilgisinde eksik VKN/vergi dairesi: fatura e-Arşiv olur.
- Seri ön eki hatası: sağlayıcı reddeder.

**Maliyet:** Fatura/kontör ücretleri e-Faturam sözleşmenize bağlıdır.

## Meta Pixel ve Dönüşüm API

**Ne işe yarar:** Tarayıcıdaki Meta Pixel olaylarını (çerez onayından sonra) ve doğrulanmış satın almaları sunucudan **Dönüşüm API** ([CAPI](term:capi)) ile Meta'ya iletir. Aynı olay iki kez sayılmasın diye ikisi de aynı **olay kimliğini** taşır ([olay kimliği](term:eventid)). Ayrıca `/feeds/meta.xml` ve `/feeds/meta.csv` ürün kataloğu beslemesi sunulur.

**Ne gerekir:** Meta Business hesabı, bir Pixel (veri kümesi) ve Events Manager erişimi.

### Anahtarlar nereden alınır?

1. Meta **Events Manager**'ı açın, Pixel'inizi seçin.
2. **Pixel / veri kümesi kimliğini** (rakamlar) kopyalayın.
3. **Ayarlar → Dönüşüm API → Erişim jetonu oluştur** ile [erişim jetonunu](term:accesstoken) üretip kopyalayın.
4. Test için **Test events** sekmesindeki [test olay kodunu](term:testeventcode) not alın.

### Hangi alana yazılır?

- **Mağaza ayarları → Takip ve reklam**: **Meta Pixel Kimliği** (tarayıcı için), **Takipten önce onay iste**.
- **Entegrasyonlar → Meta Pixel ve Dönüşüm API → Yapılandır**:

| Alan | Ne yazılır |
|---|---|
| **Pixel / Veri seti kimliği** (zorunlu) | Aynı Pixel kimliği (rakamlar, 5–20 hane) |
| **Graph API sürümü** | Boşsa varsayılan sürüm; Meta sürümü kaldırırsa güncelleyin |
| **Test olayı kodu** | Yalnızca test sırasında; canlıda **boş** olmalı |
| **Conversions API erişim jetonu** (gizli) | Erişim jetonu |

Pixel kimliğini iki yere de yazın; sunucu tarafı entegrasyon çekmecesindeki kimliği kullanır.

### Test

1. Test kodunu çekmeceye yazıp kaydedin; **Bağlantıyı test et**.
2. Vitrini gezin (pazarlama onayını verin), Events Manager → **Test events**'te olayları görün.
3. Sipariş verin: sunucu `Purchase` olayı "Server" olarak görünmeli, tarayıcı olayıyla tekilleşmeli.
4. **Mağaza ayarları → Takip ve reklam → Son pazarlama olayları** tablosunda durumlara bakın (gönderildi / hata / onay yok).

### Canlıya geçiş

Test kodunu hem **Test olayı kodu** (çekmece) ve **Meta test olayı kodu** (Takip ve reklam) alanlarından **silin**. Pixel onay olmadan yüklenmemeli; çerez bannerını ve metinlerini kontrol edin.

### Yaygın hatalar

- Onay verilmeden olay beklemek: sunucu olayı, siparişin kayıtlı onayı pazarlamaya izin vermiyorsa "onay yok" diye atlanır. Müşteri verisi SHA-256 ile özetlenir.
- Test kodu canlıda açık kalırsa olaylar yalnızca Test events'te görünür.
- Yanlış Pixel kimliği veya jeton süresi.

**Maliyet:** Pixel ve CAPI kullanımı Meta'da genellikle ücretsizdir; reklam harcamaları ayrıdır. Güncel koşulları Meta'dan doğrulayın.

## Google Analytics 4

**Ne işe yarar:** Site ziyaret ve satış ölçümü. Tarayıcı olayları çerez onayına göre (Consent Mode v2) çalışır; doğrulanmış ödemeler için sunucu tarafında Measurement Protocol ile `purchase` olayı gönderilir.

**Ne gerekir:** Bir Google Analytics 4 mülkü ve web veri akışı.

### Anahtarlar nereden alınır?

1. GA4 **Yönetici → Veri akışları → akışınız**'a girin.
2. **Ölçüm kimliğini** (`G-XXXXXXXXXX`) kopyalayın ([ölçüm kimliği](term:measurementid)).
3. **Measurement Protocol API gizli anahtarları → Oluştur** ile [API gizli anahtarı](term:apisecret) üretin.

### Hangi alana yazılır?

- **Mağaza ayarları → Takip ve reklam → GA4 Ölçüm Kimliği** (tarayıcı), isteğe bağlı **Google Tag Manager kimliği**.
- **Entegrasyonlar → Google Analytics 4 → Yapılandır**: **Ölçüm kimliği (Measurement ID)** (aynı kimlik) ve **Measurement Protocol API gizli anahtarı** (gizli).

### Test

GA4 **DebugView**'i kullanın; sunucu `purchase` olaylarını **Gerçek zamanlı** raporlarda kontrol edin. Rıza öncesi hiçbir olayın gitmediğini doğrulayın. Kurulum ayrıntısı: [Analitik ve reklam](/help/analytics).

### Canlıya geçiş ve hatalar

- Ölçüm kimliği iki yerde aynı olmalı.
- Checkout'ta GA istemci kimliği yakalanmazsa atıf sınırlı olur.
- GA4 işleme gecikmeleri vardır; rapor birkaç saat gecikebilir.

**Maliyet:** Standart GA4 ücretsiz sunulur; kotalar ve koşullar Google'a aittir.

## Netgsm

**Ne işe yarar:** Türkiye için işlemsel SMS (sipariş bildirimleri) gönderir; Türkçe karakter desteklidir.

**Ne gerekir:** Netgsm hesabı, SMS bakiyesi (kontör) ve onaylı bir **mesaj başlığı**.

### Bilgiler nereden alınır?

1. Netgsm panelinde **abone numaranızı / kullanıcı kodunuzu** bulun.
2. Bir **API alt kullanıcısı** oluşturun ve şifresini belirleyin.
3. **Mesaj başlığını** (3–11 karakter) onaylatın.

### Hangi alana yazılır?

**Entegrasyonlar → Netgsm → Yapılandır**:

| Alan | Ne yazılır | Dikkat |
|---|---|---|
| **Gönderici başlığı (msgheader)** | Gönderici başlığı, ör. `MAGAZAM` | Netgsm'de kayıtlı olmalı. **Bildirimler → SMS gönderen adı** doluysa o kullanılır. |
| **Kullanıcı kodu (abone numarası)** (gizli) | Abone numarası | |
| **API şifresi** (gizli) | API alt kullanıcı şifresi | |

Sonra **Bildirimler** sekmesinde SMS kutularını işaretleyin.

### Test ve canlıya geçiş

Herkese açık bir Netgsm sandbox'ı doğrulanmadı. Geliştirme için Mock modunu kullanın; gerçekte **Bildirimler → Deneme mesajı gönder** ile kendi numaranıza SMS atın. Bakiye/sağlık kontrolü uç noktası teyit edilemedi: **Bağlantıyı test et** sonucuna tek başına güvenmeyin.

### Yaygın hatalar

- Onaysız mesaj başlığı, bakiye yetersizliği.
- Yurt dışı numara: varsayılan ülke izin listesi `+90` olduğundan atlanır.
- Türkçe karakterli uzun mesaj: UCS-2 ile parça başına ~70 karakter, maliyet artar.
- Yalnızca işlemsel SMS gönderilir; ticari ileti ve İYS kuralları ([İYS](term:iys)) Netgsm tarafında yönetilir.

**Maliyet:** SMS başına kontör ücreti Netgsm tarifenize bağlıdır.

## Twilio

**Ne işe yarar:** Özellikle Türkiye dışı numaralara işlemsel SMS gönderir (önce ülke kodunu **SMS gönderilebilecek ülkeler**'e ekleyin).

**Ne gerekir:** Twilio hesabı ve bir gönderici (numara veya Messaging Service).

### Bilgiler nereden alınır?

Twilio Console ana sayfasından **Account SID** ve **Auth Token**; **Phone Numbers** bölümünden numaranız veya **Messaging → Services** altından Messaging Service SID.

### Hangi alana yazılır?

**Entegrasyonlar → Twilio → Yapılandır**:

| Alan | Ne yazılır |
|---|---|
| **Hesap SID'si (Account SID)** | `AC` + 32 karakter |
| **Gönderen numara (E.164)** | `+15551234567`; ya bu ya Messaging Service gerekir |
| **Messaging Service SID** | `MG…`; doluysa **From** yerine kullanılır |
| **Kimlik doğrulama anahtarı (Auth Token)** (gizli) | Twilio erişim jetonu |

### Test ve canlıya geçiş

Twilio test kimlik bilgileri ve deneme hesapları sunar; deneme hesapları yalnızca doğrulanmış numaralara gönderir. **Bildirimler → Deneme mesajı gönder** ile deneyin. Canlıya geçerken hesabı yükseltin.

### Yaygın hatalar

Gönderici kaydı (A2P 10DLC, alfanümerik gönderici) ülkeye göre sizin sorumluluğunuzdadır. `+90` dışı ülkeler izin listesine eklenmedikçe atlanır. Türkçe karakter UCS-2'ye çevirir.

**Maliyet:** Twilio parça başına ücretlendirir; fiyat ülkeye göre değişir.

## Cloudflare E-posta

**Ne işe yarar:** Sipariş e-postalarını ve panelden yazdığınız e-postaları Cloudflare Email Sending ile gönderir ([E-posta oluşturma](/help/email)).

> [!WARNING]
> Cloudflare Email Sending **Beta** aşamasındadır. Herhangi bir alıcıya göndermek için **Workers Paid** planı gerekir; **Free** planda yalnızca **doğrulanmış hedef adreslere** gönderebilirsiniz. Güncel doküman ve fiyatı Cloudflare'den kontrol edin. API değişebilir.

**Ne gerekir:** Cloudflare hesabı; gönderen alan adınızın Email Sending'e eklenmiş ve DNS kayıtlarının (SPF, DKIM, DMARC) doğrulanmış olması.

### Bilgiler nereden alınır?

1. Cloudflare panelinde **Hesap kimliğinizi** (32 karakter) kopyalayın.
2. E-posta göndermeye yetkili bir **API belirteci** oluşturun (Email Sending: Send/Edit).
3. Gönderen alan adını Email Sending'e ekleyip DNS doğrulamasını tamamlayın.

### Hangi alana yazılır?

**Entegrasyonlar → Cloudflare E-posta → Yapılandır**:

| Alan | Ne yazılır |
|---|---|
| **Cloudflare hesap kimliği (Account ID)** | 32 karakterlik hesap kimliği |
| **Varsayılan gönderen adresi** | `siparis@magazaniz.com`; **Bildirimler → Gönderen e-posta** bunu geçersiz kılar |
| **API belirteci (API token)** (gizli) | Cloudflare API belirteci |

### Test ve canlıya geçiş

Free planda kendi adresinizi doğrulanmış hedef olarak ekleyin ve **Bildirimler → Deneme mesajı gönder** ile deneyin. Canlıda herkese göndermek için planı yükseltin ve alan adı doğrulamasını tamamlayın. Teslim edilebilirlik SPF/DKIM/DMARC kurulumunuza bağlıdır.

### Yaygın hatalar

Doğrulanmamış gönderen alan adı, Free planda doğrulanmamış alıcı, yetkisiz API belirteci. Konu satırından kontrol karakterleri temizlenir; gövde tamamen kaçışlanır.

**Maliyet:** Plan ve gönderim ücretleri Cloudflare'e aittir; değişebilir. Ayrıca bkz. [Yayına geçiş](/help/going-live#maliyetler).
