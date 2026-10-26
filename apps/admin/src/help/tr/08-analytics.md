# Analitik ve reklam

Bu bölümde mağazanızın ziyaretçi ve satış istatistiklerini nasıl ölçeceğinizi, Google ve Meta (Facebook / Instagram) reklam hesaplarınızı OpenShelf'e nasıl bağlayacağınızı ve bunu yaparken ziyaretçinin çerez tercihlerine nasıl saygı gösterildiğini öğreneceksiniz. Teknik bilgi gerekmez; ancak Google ve Meta hesaplarınıza girip birkaç kimlik kopyalamanız gerekecek.

> [!NOTE]
> Bu bölüm bir hukuki danışmanlık değildir. Çerez bannerının metni ve çerezlerle ilgili yükümlülükleriniz sizin sorumluluğunuzdadır. Metinler için bir hukukçudan destek almanızı öneririz. Ayrıntı için [Müşteriler ve KVKK](/help/customers-kvkk) bölümüne bakın.

## Önce büyük resim: ne ölçülür, nasıl?

Analitik ve reklam ölçümü iki ayrı yoldan gelir. İkisini birbirinden ayırmak, sonraki bölümleri kolay anlamanızı sağlar.

| Yol | Nerede çalışır | Ne gönderir | Ne zaman çalışmaz |
|---|---|---|---|
| **Tarayıcı** | Ziyaretçinin telefonunda veya bilgisayarında | Sayfa görüntüleme, ürüne bakma, sepete ekleme, ödemeye başlama | Ziyaretçi çerezleri reddettiyse, reklam engelleyici varsa |
| **Sunucu** | OpenShelf'in çalıştığı Cloudflare Worker'ında | Satın alma (ödeme doğrulandıktan sonra) ve tarayıcı olaylarının sunucu kopyası | Çerez onayı yoksa, entegrasyon kapalıysa veya gizli anahtar eksikse |

Reklam engelleyiciler ve çerez reddi tarayıcı tarafını zayıflattığı için satış gibi önemli olayları sunucudan da iletiriz. Aynı satışın iki kez sayılmaması için her olaya bir [olay kimliği](term:eventid) verilir; bunu [Olay kimliği](#olay-kimligi) başlığında anlatıyoruz.

Üç araç söz konusudur:

* [Google Analytics 4](term:ga4) (GA4): sitenizin ziyaretçi ve satış istatistiklerini gösterir.
* [Meta Pixel](term:pixel) ve [Dönüşüm API'si](term:capi): Facebook ve Instagram reklamlarınızın hangi satışları getirdiğini ölçer.
* [Google Etiket Yöneticisi](term:gtm) (GTM): yalnızca ajansınız veya pazarlamacınız kullanıyorsa gerekir.

Reklam vermiyorsanız ve istatistik merak etmiyorsanız bu bölümü atlayabilirsiniz; mağaza bunlar olmadan da eksiksiz çalışır.

## İki ayrı yer: Takip ve reklam sekmesi ve Entegrasyonlar

Kurulum iki ekrana bölünmüştür. Bu, en sık karıştırılan noktadır.

| Ne | Nerede girilir | Gizli mi? |
|---|---|---|
| GA4 [ölçüm kimliği](term:measurementid) (`G-...`) | **Mağaza ayarları → Takip ve reklam** | Hayır, sitenizin kaynağında görünür |
| GTM kapsayıcı kimliği (`GTM-...`) | **Mağaza ayarları → Takip ve reklam** | Hayır |
| Meta Pixel kimliği (sayılardan oluşur) | **Mağaza ayarları → Takip ve reklam** | Hayır |
| Çerez onayı anahtarı ve Meta test modu | **Mağaza ayarları → Takip ve reklam** | Hayır |
| GA4 [Measurement Protocol API gizli anahtarı](term:apisecret) | **Entegrasyonlar → Google Analytics 4** | Evet, şifreli saklanır, bir daha gösterilmez |
| Meta [erişim jetonu](term:accesstoken) | **Entegrasyonlar → Meta Pixel ve Dönüşüm API** | Evet, şifreli saklanır, bir daha gösterilmez |

Kural basit: **herkesin görebileceği kimlikler Takip ve reklam sekmesine, gizli anahtarlar Entegrasyonlar sayfasına yazılır.** Gizli anahtarlar hakkında genel bilgi için [Güvenlik](/help/security#gizli-anahtarlar) bölümüne bakın.

Entegrasyon kartlarında (Google Analytics 4 ve Meta) da ölçüm kimliği ve Pixel kimliği alanları bulunur; sunucu tarafı bu alanları kullanır. İki yere **aynı kimliği** yazın. Takip ve reklam sekmesinde kimlik girmek tarayıcıdaki kodları, Entegrasyonlar kartı ise sunucudan gönderimi ayarlar.

![Takip ve reklam sekmesi](help/tr/settings-tracking.png)

Sekmenin altında **Son pazarlama olayları** tablosu bulunur. Sunucudan gönderilen olayları (zaman, olay adı, olay kimliği, hedef ve durum) buradan izlersiniz.

![Entegrasyonlar sayfası](help/tr/integrations-hub.png)

## Çerez onayı

Ziyaretçi sitenize ilk girdiğinde bir çerez bannerı görür. Banner üç kategori sunar:

| Kategori | Ne için | Onay gerekir mi? |
|---|---|---|
| **Gerekli** | Sepetin ve oturumun çalışması | Hayır, her zaman açık |
| **Analitik** | GA4 gibi ziyaretçi istatistikleri | Evet |
| **Pazarlama** | Meta Pixel ve reklam ölçümü | Evet |

Ziyaretçi seçimini yapana kadar hiçbir analitik veya reklam kodu yüklenmez. Google'a "Consent Mode v2" ile varsayılan olarak tüm izinlerin **reddedildiği** bildirilir; ziyaretçi seçim yaptığında analitik onayı Google'ın analiz iznine, pazarlama onayı ise üç reklam iznine (reklam depolama, reklam kullanıcı verisi, reklam kişiselleştirme) dönüştürülür.

Seçim ziyaretçinin tarayıcısında saklanır ve ayrıca **onay kaydı** olarak sunucuya yazılır (rastgele bir ziyaretçi kimliği, iki tercih, çerez metninin sürümü ve IP adresiyle). Kayıtların ne işe yaradığını [Onay kayıtları](/help/customers-kvkk#onay-kayitlari) başlığında bulabilirsiniz. Çerez metnini önemli ölçüde değiştirirseniz sürüm numarası değişir ve ziyaretçilere banner yeniden gösterilir.

**Takip öncesi onay iste** anahtarı (**Takip ve reklam** sekmesinde) bu davranışı yönetir:

* **Açık (önerilen):** Yukarıda anlatılan akış çalışır.
* **Kapalı:** Banner gösterilmez ve her şey izne bakılmadan çalışır. Yalnızca hukuki durumunuzu netleştirdiyseniz ve bir hukukçuya danıştıysanız kapatın.

> [!WARNING]
> Onay isteğini kapatmak, çerez ve izleme kurallarına uyum konusunda sizi sorumlu kılabilir. Emin değilseniz açık bırakın.

Genellikle "kabul" ve "reddet" seçeneklerinin eşit kolaylıkta sunulması beklenir. Bannerın metnini ve uygunluğunu kontrol etmek sizin işinizdir.

## Google Analytics 4 kurulumu

Bu başlık, GA4'ü hem tarayıcı hem sunucu tarafında çalıştırmak için gereken tüm adımları anlatır.

**Başlamadan önce:** Bir Google hesabınız ve bir GA4 "mülk"ü olmalı. Yoksa analytics.google.com adresinde oluşturun; mülk oluştururken sitenizin adresini ve saat dilimini (Türkiye) doğru girin.

1. Google Analytics'te **Yönetici → Veri akışları** bölümüne gidin ve web veri akışınıza tıklayın.
2. Sağ üstteki **Ölçüm Kimliği**'ni kopyalayın. `G-` ile başlar ve büyük harf ile rakamlardan oluşur, örneğin `G-AB12CD34EF`.
3. OpenShelf'te **Mağaza ayarları → Takip ve reklam** sekmesini açın, **GA4 ölçüm kimliği** alanına yapıştırın ve kaydedin. Biçim yanlışsa alan "Biçim: G-XXXXXXXXXX" uyarısı verir.
4. Aynı veri akışı sayfasında aşağı inin ve **Measurement Protocol API gizli anahtarları** bölümünden **Oluştur**'a tıklayın. Bir ad verin (örneğin "OpenShelf") ve oluşan gizli değeri kopyalayın.
5. OpenShelf'te **Entegrasyonlar** sayfasında **Google Analytics 4** kartını açın (Takip sekmesindeki **GA4'ü yapılandır** düğmesi de sizi oraya götürür).
6. Ölçüm kimliğini yazın, gizli anahtarı **Measurement Protocol API gizli anahtarı** alanına yapıştırın, kartı etkinleştirin ve kaydedin.
7. Kartta **Bağlantıyı sına** düğmesine basın. Başarılıysa devam edin; hata alırsanız [Entegrasyon hataları](/help/troubleshooting#entegrasyon-hatalari) bölümüne bakın.

![Entegrasyon düzenleme paneli](help/tr/integration-drawer.png)

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| GA4 ölçüm kimliği | Veri akışındaki `G-` kimliği | `G-AB12CD34EF` | Başında veya sonunda boşluk olmasın; küçük harf kabul edilmez |
| GTM kapsayıcı kimliği | GTM'deki `GTM-` kimliği | `GTM-ABC1234` | Ajansınız yoksa boş bırakın; GA4'ü hem GTM'den hem buradan kurarsanız olaylar iki kez sayılabilir |
| Measurement Protocol API gizli anahtarı | GA4'ten oluşturduğunuz gizli değer | (uzun harf-rakam dizisi) | Yalnızca Entegrasyonlar'a yazılır; kaydettikten sonra tekrar görünmez |

> [!TIP]
> GTM kullanıyorsanız GA4 etiketini GTM içinden kurup OpenShelf'te yalnızca GTM kimliğini yazmayı tercih edebilirsiniz. Böyle bir kurulumda hangi araçtan hangi olayın gittiğini ajansınızla netleştirin; aynı olayı iki yerden göndermek veriyi şişirir.

GA4'te şu olaylar izlenir: sayfa görüntüleme, ürün listesi görüntüleme, ürün görüntüleme, arama, sepete ekleme, ödemeye başlama, ödeme bilgisi ekleme, satın alma ve iade. Ürün kimliği olarak her yerde **çeşidin kimliği** kullanılır; böylece GA4, Meta ve Meta katalog akışı (`/feeds/meta.xml`, `/feeds/meta.csv`) birbirini tutar. Para tutarları olay içinde ana birimle (örneğin `199.90`) iletilir.

> [!NOTE]
> GA4 verileri raporlara hemen düşmez; işleme gecikmesi ve eşik uygulamaları olabilir. İlk gün sayıları eksik görünüyorsa endişelenmeyin.

## Meta Pixel kurulumu

Meta tarafında iki parça vardır: tarayıcıdaki **Pixel** ve sunucudan gönderen **Dönüşüm API'si**. Aynı veri kümesini (Pixel / Dataset) kullanırlar.

**Başlamadan önce:** Bir Meta Business hesabı ve Etkinlik Yöneticisi'nde bir Pixel (veri kümesi) gerekir.

1. Meta **Etkinlik Yöneticisi**'ni açın ve Pixel'inizi seçin. Pixel kimliği, 5–20 haneli bir sayıdır (örneğin `123456789012345`).
2. OpenShelf'te **Mağaza ayarları → Takip ve reklam** sekmesindeki **Meta Pixel kimliği** alanına yalnızca rakamları yazın ve kaydedin.
3. Etkinlik Yöneticisi'nde **Ayarlar** bölümünde **Dönüşüm API'si** başlığının altından **Erişim jetonu oluştur**'u seçin ve jetonu kopyalayın.
4. OpenShelf'te **Entegrasyonlar → Meta Pixel ve Dönüşüm API** kartını açın (**Meta'yı yapılandır** düğmesi de oraya götürür).
5. **Pixel / Veri kümesi kimliği** alanına aynı sayıyı, **Dönüşüm API'si erişim jetonu** alanına jetonu yazın. Kartı etkinleştirin ve kaydedin.
6. **Bağlantıyı sına** düğmesine basın.

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| Meta Pixel kimliği | Pixel / veri kümesi numarası | `123456789012345` | Yalnızca rakam; harf veya boşluk hata verir |
| Erişim jetonu | Etkinlik Yöneticisi'nden oluşturduğunuz jeton | (uzun dizi) | Gizlidir; süresi dolarsa veya iptal edilirse sunucu olayları "başarısız" görünür |
| Test olayı kodu | Etkinlik Yöneticisi → Test olayları'ndaki kod | `TEST12345` | Yayına almadan önce silin |

Meta olay adları GA4'ten farklıdır; OpenShelf bunları sizin için eşler:

| GA4 olayı | Meta olayı |
|---|---|
| Sayfa görüntüleme | PageView |
| Ürün görüntüleme | ViewContent |
| Arama | Search |
| Sepete ekleme | AddToCart |
| Ödemeye başlama | InitiateCheckout |
| Ödeme bilgisi ekleme | AddPaymentInfo |
| Satın alma | Purchase |

Ürün listesi görüntüleme ve iade yalnızca GA4'te vardır; Meta'ya gönderilmez.

Sunucu olaylarında müşteri bilgileri (e-posta, telefon gibi) Meta'ya gönderilmeden önce düzenlenir ve geri döndürülemez biçimde karıştırılır (SHA-256 özet). Yani düz metin e-posta adresi Meta'ya gitmez.

## Satın alma olayı: yalnızca doğrulanmış ödemeden sonra

Satın alma (Purchase) olayı kasıtlı olarak diğerlerinden farklı çalışır:

* Tarayıcı satın alma olayı **gönderemez**. Tarayıcıdan gelen satın alma veya iade isteği sunucu tarafından reddedilir.
* Olay yalnızca ödeme sağlayıcısı (iyzico) ödemeyi bildirdikten ve OpenShelf bunu tutar ve para birimi eşleşmesiyle **doğruladıktan sonra** oluşturulur.
* Böylece ödenmemiş, iptal edilmiş veya sahte bir sipariş reklam verinize "satış" olarak yazılmaz.
* Olay arka planda sıraya alınır ([outbox](term:outbox)). Sağlayıcı geçici olarak yanıt vermezse sistem otomatik olarak yeniden dener.

Sunucu olayı, siparişin verildiği anda kaydedilen **onay özetine** bakar: GA4 için analitik onayı, Meta için pazarlama onayı gerekir. Ziyaretçi ilgili izni vermediyse olay **gönderilmez** ve kaydı `skipped_no_consent` ("onay yok, atlandı") durumuyla tutulur. Bu hata değildir; doğru çalışan bir korumadır.

| Durum (tabloda) | Anlamı | Ne yapmalı |
|---|---|---|
| `sent` | Olay sağlayıcıya iletildi | Bir şey yapmayın |
| `failed` | Sağlayıcı reddetti veya ulaşılamadı | Kimlik/gizli anahtarı kontrol edin; sistem yeniden dener |
| `skipped_no_consent` | Müşteri ilgili çerez iznini vermemişti | Normaldir; bu satış reklam verisine yazılmaz |

Ödeme akışının tamamını [Sipariş ve ödeme doğrulama](/help/orders#odeme-dogrulama) bölümünde bulabilirsiniz.

## Olay kimliği

Her olay benzersiz bir **olay kimliği** (UUID) taşır. Tarayıcıdaki Pixel bunu `eventID`, sunucudaki Dönüşüm API'si `event_id` olarak gönderir. Meta, aynı olay adı ve kimliğe sahip tarayıcı + sunucu çiftini **tek olay** sayar; bu işleme tekrar sayımı önleme (deduplication) denir.

* Satın alma olayının kimliği, sipariş numarasından türetilir; aynı sipariş için her zaman aynı kimlik üretilir. Böylece olay yeniden denense bile iki kez sayılmaz.
* GA4 tarafında ayrıca `transaction_id` kullanılır; OpenShelf kendi kayıt tablosunda (olay kimliği + olay adı + hedef) aynı olayı ikinci kez göndermez.
* Siparişin ödeme dönüş sayfasında tarayıcı bir satın alma olayı **tetiklemez**; tek kaynak sunucudur.

> [!TIP]
> Meta Etkinlik Yöneticisi'nde bir olayın yanında hem "Tarayıcı" hem "Sunucu" yazıp yine de tek olarak sayılması beklenen durumdur. İki ayrı sayı görüyorsanız olay kimliklerinin aynı olup olmadığını **Son pazarlama olayları** tablosundan kontrol edin.

Ziyaretçinin hangi reklamdan geldiği ([UTM](term:utm) etiketleri, `fbclid`, `gclid`, Meta çerezleri `fbc`/`fbp`, GA istemci kimliği) sipariş sırasında siparişle birlikte saklanır; sunucu olayları bu bilgiyi kullanır. Ayrı UTM kayıtları yalnızca müşteri pazarlama onayı verdiyse tutulur. Müşteriyi [anonimleştirdiğinizde](/help/customers-kvkk#kvkk-ve-anonimlestirme) bu kayıtlar da silinir.

## Test etme

Canlıya geçmeden önce her aracı sınayın. Önerilen sıra:

### GA4 ile

1. Sitenizi `?debug_mode=1` ekleyerek açın (örneğin `magazaniz.com/?debug_mode=1`) veya Google Analytics Debugger tarayıcı eklentisini kullanın.
2. Google Analytics'te **Yönetici → DebugView**'u açın. Olayların ve parametrelerin geldiğini görün.
3. **Çerez bannerında henüz seçim yapmadan** DebugView'a bakın: hiçbir olay gelmemelidir. Analitik çerezlerini kabul ettikten sonra olaylar başlamalıdır.
4. Sunucudan giden satın alma olayı DebugView'da her zaman görünmez; **Gerçek zamanlı** raporu veya normal raporları kontrol edin.

### Meta ile

1. Etkinlik Yöneticisi'nde Pixel'inize girip **Test olayları** sekmesini açın ve oradaki kodu kopyalayın.
2. OpenShelf'te **Takip ve reklam** sekmesinde **Test olayı modu (Meta)** anahtarını açın ve kodu **Meta test olayı kodu** alanına yazın.
3. Sitenizde gezin, çerez bannerında pazarlama çerezlerini kabul edin; tarayıcı olaylarının Test olayları ekranında göründüğünü doğrulayın.
4. Deneme siparişi verin (ödeme için [deneme modu](/help/getting-started#deneme-modu) veya iyzico sandbox kullanın) ve Test olayları'nda sunucudan gelen **Purchase** olayını görün.
5. **Yayına almadan önce test kodunu silin ve anahtarı kapatın.**

> [!WARNING]
> Test kodu açıkken sunucu olayları gerçek reklam verisi yerine test ekranına düşer. Yayına geçtiğinde kod unutulursa reklam raporlarınız boş kalır.

### OpenShelf içinde

**Takip ve reklam** sekmesinin altındaki **Son pazarlama olayları** tablosunda her sunucu olayını görürsünüz. Hedef sütununda Meta için `meta_capi`, GA4 için `ga4_mp` yazar. Durumlar `sent`, `failed`, `skipped_no_consent` olarak izlenir. Ayrıca **Entegrasyon olayları** sayfası hata ayrıntılarını gösterir:

![Entegrasyon olayları](help/tr/integration-events.png)

[Deneme modu](term:mock) açıkken olaylar gerçekten gönderilmez, **Mock gelen kutusu**na "Olay (reklam/analitik)" kanalı olarak düşer:

![Mock gelen kutusu](help/tr/mock-inbox.png)

## Sık yapılan hatalar

* **GA4 kimliğini yalnızca Entegrasyonlar'a yazmak.** Tarayıcı kodu da çalışsın istiyorsanız kimliği Takip ve reklam sekmesine de yazın.
* **Gizli anahtarı Takip ve reklam sekmesine aramak.** Gizli alanlar orada yoktur; Entegrasyonlar kartlarındadır.
* **Pixel kimliğine harf veya boşluk eklemek.** Yalnızca rakam kabul edilir.
* **Test kodunu yayında unutmak.** Yukarıdaki uyarıya bakın.
* **Çerez onayını kapatıp unutmak.** Banner yok demek, izin alınmadan izleme demektir.
* **GTM ve GA4'ü aynı anda kurmak.** Olaylar iki kez sayılabilir.
* **Satın alma sayısını siparişle birebir beklemek.** Çerez reddeden müşterilerin satışı reklam verisine yazılmaz; bu normaldir; reklam raporundaki sayı gerçek siparişlerden biraz düşük çıkabilir.
* **Denemeden sonra anahtarları değiştirmeyi unutmak.** Deneme (sandbox) ve canlı anahtarlar farklıdır; bkz. [Yayına alma](/help/going-live#gizli-anahtarlar-ve-ortam).

## Özet kontrol listesi

1. GA4 ölçüm kimliği ve (kullanıyorsanız) Meta Pixel kimliği Takip ve reklam sekmesinde.
2. Measurement Protocol gizli anahtarı ve Meta erişim jetonu Entegrasyonlar'da, kartlar etkin ve **Bağlantıyı sına** başarılı.
3. Takip öncesi onay isteği açık.
4. DebugView ve Test olayları ile denendi; onaydan önce olay yok.
5. Test olayı kodu ve modu kapatıldı.
6. Son pazarlama olayları tablosunda `failed` kayıtları yok.
