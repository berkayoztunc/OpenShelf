# Müşteriler ve KVKK

Bu bölümde müşteri listesini nasıl kullanacağınızı, bir müşteri kişisel verilerinin silinmesini istediğinde ne yapacağınızı, çerez ve iletişim izinlerinin nasıl kaydedildiğini ve yasal metinlerinizi nasıl yöneteceğinizi öğreneceksiniz.

> [!WARNING]
> Bu bölüm ve OpenShelf'in sunduğu hazır metin şablonları **hukuki danışmanlık değildir**. Kanunlar, kurum görüşleri ve işletmenizin durumu farklıdır. OpenShelf size kayıt ve silme araçları verir; mevzuata uyumun sorumluluğu mağaza sahibi olarak sizdedir. Siparişleri almaya başlamadan önce metinlerinizi bir hukukçuya kontrol ettirin.

## Müşteriler

**Müşteriler** sayfası, siparişi vermiş kişileri listeler. Bir kişi mağazanızda ilk siparişini verdiğinde kaydı otomatik oluşur; elle müşteri eklemeniz gerekmez. Kayıt sırasında müşteri e-posta adresini, adını ve adres bilgilerini sipariş formunda kendisi girer.

![Müşteriler sayfası](help/tr/customers.png)

| Sütun / düğme | Ne gösterir veya yapar |
|---|---|
| **Müşteri** | Ad ve altında e-posta adresi |
| **Kayıt tarihi** | Müşterinin ilk kaydının oluştuğu tarih ve saat |
| **E-posta gönder** | Seçili müşteriye yeni bir e-posta yazma ekranını açar ([E-posta](/help/email#e-posta-yazma)) |
| **Anonimleştir** | Müşterinin kişisel verilerini kalıcı olarak siler (aşağıda ayrıntılı) |
| **Anonimleştirildi** (rozet) | Bu müşterinin verisi daha önce silinmiş; artık işlem yapılamaz |

**Ara** alanına adın veya e-posta adresinin bir bölümünü yazarak müşteri bulabilirsiniz (örneğin `ayse` veya `@gmail`). Liste sayfalara bölünür.

### Kim ne yapabilir?

| İşlem | Personel | Yönetici | Mağaza sahibi |
|---|---|---|---|
| Müşteri listesini görmek ve aramak | Evet | Evet | Evet |
| E-posta göndermek | Hayır | Evet | Evet |
| Anonimleştirmek | Hayır | Evet | Evet |
| Müşteri listesini dışa aktarmak | Hayır | Evet | Evet |

Rollerin ayrıntısı için [Kullanıcılar ve roller](/help/security#kullanicilar-ve-roller) başlığına bakın.

### Müşteri verisi nereye gidiyor?

Bir sipariş verildiğinde müşteri bilgileri şu amaçlarla kullanılır ve paylaşılır:

* **Sipariş ve teslimat:** Ad, adres ve telefon kargo firmasına etiket oluşturmak için iletilir.
* **Ödeme:** Ödeme sayfası ödeme kuruluşunun (iyzico) sayfasıdır. Kart bilgisi OpenShelf'e hiç ulaşmaz ([barındırılan ödeme sayfası](term:hostedcheckout)).
* **Fatura:** Alıcı bilgileri fatura entegratörüne iletilir.
* **Bildirimler:** E-posta ve telefon, yalnızca sipariş bilgilendirme mesajları için kullanılır.
* **Reklam ölçümü:** Müşteri pazarlama çerezlerini kabul ettiyse sipariş bilgileri (düzenlenip özetlenmiş hâliyle) Meta'ya iletilebilir ([Analitik ve reklam](/help/analytics)).

Cloudflare, ödeme kuruluşu, kargo firması ve reklam platformları Türkiye dışında hizmet verebilir; bu, KVKK'daki yurt dışına aktarım kurallarını ilgilendirebilir. Gerekli bildirimleri ve metinleri hazırlamak sizin sorumluluğunuzdadır.

## KVKK ve anonimleştirme

[KVKK](term:kvkk), kişisel verilerinizi nasıl işlediğiniz ve müşterilerin hakları (bilgi alma, silme isteme gibi) hakkındaki kanundur. Bir müşteri "verilerimi silin" derse karşılamanız gereken bir talep doğabilir. OpenShelf'in bu durumdaki aracı **anonimleştirmedir**.

### Anonimleştirme nedir?

[Anonimleştirme](term:anonymize), müşterinin kişisel bilgilerini geri alınamaz biçimde siler, ama siparişin mali kaydını (tutarlar, ürünler, tarihler) korur. Böylece müşteri tanınamaz hâle gelir, ancak muhasebe ve vergi kayıtlarınız bozulmaz.

### Ne silinir, ne kalır?

| Veri | Anonimleştirmeden sonra |
|---|---|
| Müşterinin adı, soyadı | Silinir |
| Telefon numarası | Silinir |
| E-posta adresi | Anlamsız bir adresle değişir (`anonymized+…@anonymized.invalid`) |
| Kayıtlı adresler | Silinir |
| Çerez ve iletişim onay kayıtları | Silinir |
| Siparişlerdeki teslimat adresi | "anonimleştirildi" ifadesiyle değişir |
| Siparişlerdeki fatura adresi | Silinir |
| Siparişlerdeki e-posta | Anlamsız adresle değişir |
| Siparişlerdeki IP adresi ve tarayıcı bilgisi | Silinir |
| Siparişlerdeki reklam kaynağı bilgisi (UTM, `fbclid`, `gclid` vb.) ve ayrı reklam kaynağı kayıtları | Silinir |
| Siparişlere yazdığınız notlar | Silinir |
| Sipariş numarası, tarih, ürünler, adetler, tutarlar, KDV | **Kalır** |
| Ödeme kayıtları ve durumları | **Kalır** |
| Kesilmiş faturalar | **Değiştirilmez** (aşağıdaki uyarıya bakın) |
| Denetim kaydı | Kalır; kayıtta yalnızca "müşteri anonimleştirildi" ve sipariş sayısı yazar, kişisel veri yazmaz |

> [!DANGER]
> Anonimleştirme **geri alınamaz**. Silinen ad, telefon ve adres hiçbir şekilde geri getirilemez; yedekten bile kolay dönülmez. Talebin gerçekten o kişiden geldiğinden emin olun ve işlemi onaylamadan önce bir kez daha düşünün.

> [!WARNING]
> Kesilmiş faturalar fatura entegratörünün (örneğin Trendyol e-Faturam) sisteminde de bulunur ve vergi mevzuatı gereği belirli süre saklanması gerekir. Anonimleştirme, OpenShelf'ten gönderilmiş faturaları, entegratör kayıtlarını veya gönderilmiş e-postaların kayıtlarını değiştirmez. Silme talebini karşılarken bu kayıtların durumunu mali müşaviriniz ve hukukçunuzla değerlendirin.

### Anonimleştirme adım adım

1. **Müşteriler** sayfasını açın ve müşteriyi **Ara** ile bulun.
2. Satırın sağındaki **Anonimleştir** düğmesine basın.
3. Açılan **Müşteriyi anonimleştir (KVKK)** penceresini dikkatle okuyun. Pencere, silinecek e-posta adresini gösterir.
4. Emin olduğunuzda **Anonimleştir**'e basın.
5. "Müşteri anonimleştirildi" bildirimini görürsünüz; satırda **Anonimleştirildi** rozeti çıkar.

Bu işlem yalnızca **yönetici** ve **mağaza sahibi** rolleriyle yapılabilir.

### Anonimleştirmeden sonra ne olur?

* Müşteri aynı e-posta adresiyle yeniden alışveriş yaparsa **yepyeni bir müşteri kaydı** oluşur; eski kayıtla ilişkilendirilmez.
* Eski siparişleri görüntülediğinizde müşteri adı yerine anlamsız adres görünür.
* Anonimleştirilmiş müşteriye e-posta gönderemez veya yeni fatura kesemezsiniz.

### Silme talebi geldiğinde izlenecek yol

Bu bir hukuki tavsiye değil, genel bir iş akışı önerisidir:

1. Talebi yazılı alın ve talebi yapan kişinin kimliğini doğrulayın (siparişteki e-posta üzerinden yazması gibi).
2. Silinmesi gereken ve yasal olarak saklanması gereken verileri netleştirin (faturalar ve muhasebe kayıtları genelde saklanır).
3. Gerekirse önce bir [yedek](/help/data#yedekleme) alın; fakat yedeklerde de kişisel veri olacağını unutmayın.
4. Müşteriyi anonimleştirin.
5. Müşteriye talebinin sonucunu yazılı bildirin; yasal süreleri hukukçunuza sorun.
6. Başka sistemlerde (kargo firması paneli, fatura entegratörü, e-posta kutunuz, reklam hesapları) saklanan kopyaları da ayrıca ele alın.

## Onay kayıtları

Ziyaretçi çerez bannerında seçim yaptığında ve müşteri ödeme sayfasında onay verdiğinde OpenShelf bir **onay kaydı** tutar. Bu kayıtlar, "kim, ne zaman, neye izin verdi" sorusunun cevabını sonradan göstermek içindir.

Bir onay kaydında şunlar bulunur:

| Alan | Anlamı |
|---|---|
| Ziyaretçi kimliği | Tarayıcıda oluşturulan rastgele kimlik (kişinin adı değildir) |
| Analitik izni | Evet / hayır |
| Pazarlama izni | Evet / hayır |
| Çerez metni sürümü | Hangi metin sürümü gösterilirken onay verildiği |
| IP adresi | Onayın verildiği bağlantı adresi |
| Tarih | Kayıt zamanı |
| Müşteri | Sipariş sırasında verilen onaylarda müşteriyle ilişkilendirilir |

Önemli noktalar:

* **Onay isteği açıkken** analitik ve reklam kodları, [onay](term:consent) verilmeden çalışmaz. Ayrıntı: [Çerez onayı](/help/analytics#cerez-onayi).
* Müşteri siparişini verirken seçtiği tercihler **sipariş üzerinde de bir özet olarak** saklanır. Satın alma olayı sunucudan gönderilirken bu özet kontrol edilir; onay yoksa olay gönderilmez.
* En son kayıt geçerlidir: ziyaretçi fikrini değiştirirse yeni bir kayıt eklenir.
* Çerez metninizi önemli ölçüde değiştirirseniz sürüm numarası değişir ve ziyaretçilere banner yeniden gösterilir.
* Müşteriyi anonimleştirdiğinizde müşteriye bağlı onay kayıtları silinir.
* Bu kayıtları panelden ayrı bir ekranda listelemezsiniz; kayıtlar sistem tarafından tutulur ve gerektiğinde teknik destekle erişilebilir.

## İletişim izinleri ve İYS notu

OpenShelf **yalnızca işlem bildirimleri** gönderir: ödeme alındı, kargoya verildi, teslim edildi, iptal, iade gibi sipariş bilgilendirmeleri ve yöneticiye yeni sipariş bildirimi. Toplu kampanya, indirim duyurusu veya reklam amaçlı e-posta/SMS gönderen bir özellik **yoktur**.

Müşteriye kampanya veya reklam amaçlı ticari ileti göndermek ayrı bir izin gerektirir ve izinlerin [İYS](term:iys) kaydı gibi konular gündeme gelir. Bunu yapmak isterseniz OpenShelf dışında bir araç ve hukuki destek kullanın. Panelden **E-postalar → Yeni e-posta** ile gönderdiğiniz e-postaları da pazarlama için kullanmayın; bu ekran tek tek, bire bir yazışma içindir ve günlük gönderim sınırları vardır ([E-posta gönderim limitleri](/help/email#gonderim-limitleri)).

## Yasal metinler

**Mağaza ayarları → Yasal metinler** sekmesinde, mağazanızda yayımlanan beş metni yazarsınız. Her biri vitrinde `/legal/...` adresinde ayrı bir sayfa olarak açılır.

![Yasal metinler sekmesi](help/tr/settings-legal.png)

| Metin | Ne için | Nerede görünür |
|---|---|---|
| KVKK | Kişisel verilerin nasıl işlendiğini anlatan aydınlatma metni | Ödeme sayfasında ve alt bilgide bağlantı |
| Mesafeli satış | [Mesafeli satış sözleşmesi](term:distancesales) ve ön bilgilendirme | Ödeme sırasında müşteri onaylar |
| İade | İade, değişim ve [cayma hakkı](term:distancesales) koşulları | Alt bilgide bağlantı |
| Çerezler | Hangi çerezlerin neden kullanıldığı | Çerez bannerında bağlantı |
| Gizlilik | Gizlilik politikası | Alt bilgide bağlantı |

Metin yazarken:

1. İlgili sekmeyi seçin (KVKK, Mesafeli satış, İade, Çerezler, Gizlilik).
2. Yazmaya başlamak için **TR şablonu ekle** veya **EN şablonu ekle** düğmesini kullanın. Bu düğme metin alanındakini şablonla **değiştirir**; daha önce yazdığınız metin varsa önce bir kopyasını saklayın.
3. Metni kendi bilgilerinizle düzenleyin. Metin alanı Markdown (basit biçimlendirme) kabul eder.
4. Şablon içindeki `{storeName}`, `{contactEmail}`, `{taxId}`, `{address}` gibi yer tutucular vitrinde mağaza bilgilerinizle otomatik doldurulur. Bu bilgileri **Mağaza ayarları → Genel** sekmesinde doldurmayı unutmayın.
5. Kaydedin ve vitrinde `/legal/kvkk` gibi adresleri açıp sayfayı kontrol edin.

> [!WARNING]
> Şablonlar yalnızca başlangıç noktasıdır. Mesafeli satış sözleşmesi, cayma hakkı ve iade süreleri, ön bilgilendirme formu, KVKK aydınlatma ve çerez metinleri gibi konuların kapsamı işletmenize göre değişir. Metinleri yayınlamadan önce bir hukukçuya inceletin.

Mesafeli satış metni **ödeme öncesinde müşteriye gösterilip onaylatılmalıdır**. OpenShelf ödeme sayfasında müşteriden bu onayı alır ve onay verilmeden sipariş oluşmaz. Metnin içeriği (cayma hakkı, teslim süresi, iade koşulları, istisnalar) sizin sorumluluğunuzdadır. İade nasıl işler: [Siparişler: iade](/help/orders#iade).

Boş bıraktığınız bir metnin sayfası vitrinde açılmaz ("Sayfa bulunamadı" gösterir); bu nedenle yayına almadan önce beş metnin hepsinin dolu olduğundan emin olun.

### Türkiye'de genelde düşünülmesi gereken konular

Bu liste kapsamlı değildir ve hukuki görüş değildir; yalnızca neleri araştırmanız gerektiğini hatırlatır:

* **KVKK:** aydınlatma metni, işleme amaçları ve saklama süreleri, ilgili kişi talepleri, eşik aşılıyorsa [VERBİS](term:verbis) kaydı, yurt dışına aktarım.
* **Çerezler:** zorunlu olmayan çerezler için önceden onay.
* **Mesafeli satış:** ön bilgilendirme formu, sözleşme, 14 günlük cayma hakkı ve istisnaları, iade süreleri.
* **Fatura:** e-Fatura/e-Arşiv yükümlülüğü mükellefiyet durumunuza bağlıdır ([Faturalar](/help/invoices)).
* **ETBİS:** bazı işletmeler için kayıt yükümlülüğü ([ETBİS](term:etbis)).
* **Ticari iletiler:** ticari elektronik ileti izinleri.
* **Tüketici hakları:** KDV dahil fiyat gösterimi, garanti, şikayet kanalları.
* Başka ülkelerdeki müşteriler için (AB'de GDPR gibi) ayrı kurallar olabilir.

## Sık yapılan hatalar

* **Hazır şablonu hiç değiştirmeden yayınlamak.** Şablondaki genel ifadeler işletmenizi tam yansıtmaz.
* **Yasal metinleri boş bırakmak.** Sayfalar açılmaz, ödeme sırasında bağlantılar kırık kalabilir.
* **Anonimleştirmeyi yanlış müşteriye yapmak.** Geri alınamaz; e-posta adresini onay penceresinde dikkatle okuyun.
* **Anonimleştirmenin faturaları da sildiğini sanmak.** Faturalar ve entegratör kayıtları ayrıdır.
* **Müşteri verisini gereksiz toplamak.** Kimlik numarasını (TCKN) yalnızca gerektiğinde isteyin; bkz. [VKN ve TCKN](/help/invoices#vkn-ve-tckn).
* **Panelden toplu kampanya e-postası göndermek.** Bu ekran buna uygun değildir; ayrı izin ve araç gerekir.
* **Yedekleri ve dışa aktarılan dosyaları güvensiz saklamak.** Bu dosyalarda kişisel veri vardır; bkz. [Veri aktarımı ve yedek](/help/data).
* **Çerez onayını kapatmak.** Hukuki durumunuzu netleştirmeden kapatmayın.
