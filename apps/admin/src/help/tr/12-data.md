# Veri aktarımı ve yedek

Bu bölümde mağaza verilerinizi dosya olarak nasıl dışarı alacağınızı (Excel'de açmak, muhasebecinize vermek, yedeklemek için), ürünlerinizi bir tablodan toplu olarak nasıl içeri aktaracağınızı ve tam bir veritabanı yedeğinin nasıl alınacağını öğreneceksiniz. Hepsi **Veri aktarımı** sayfasındadır.

![Veri aktarımı sayfası](help/tr/data.png)

Bu sayfayı yalnızca **yönetici** ve **mağaza sahibi** görür. Personel göremez. Dışa aktarılan her dosyada müşteri kişisel verisi bulunabileceği için bu kısıtlama bilinçlidir.

> [!WARNING]
> Dışa aktarılan dosyalar (özellikle siparişler ve müşteriler) kişisel veri içerir. Bu dosyaları e-postayla, ortak bulut klasörleriyle veya sohbet uygulamalarıyla paylaşmayın; işiniz bitince silin. Bkz. [Müşteriler ve KVKK](/help/customers-kvkk).

## Dışa aktarma

**Veri aktarımı → Dışa aktar** kartında bir liste vardır. Her satırın yanındaki **CSV** veya **JSON** düğmesine basınca dosya bilgisayarınıza iner.

| Ne | Biçim | İçinde ne var | Not |
|---|---|---|---|
| Ürünler | CSV, JSON | Her çeşit için bir satır: adres (slug), ad, durum, kategori, marka, KDV oranı, stok kodu, barkod, çeşit adı, fiyatlar, stok, güvenlik stoku, ağırlık | CSV, ürünleri geri içe aktarmak için şablon olarak da kullanılabilir |
| Siparişler | CSV, JSON | Sipariş numarası, kaynak, durum, e-posta, para birimi, ara toplam, indirim, kargo, vergi, toplam, kupon, tarih | En yeni 10.000 sipariş |
| Müşteriler | CSV, JSON | Kimlik, e-posta, ad, soyad, telefon, kayıt tarihi | En yeni 10.000 müşteri |
| Yapılandırma | Yalnızca JSON | Tüm mağaza ayarları ve entegrasyonların açık/kapalı durumu ile gizli olmayan ayarları | **Gizli anahtarları içermez** |

Birkaç önemli ayrıntı:

* **Tutarlar normal para biçimindedir.** Dosyada `199.90` görürsünüz (kuruş değil, lira). Excel'de Türkçe ayarlarda bu sayıyı virgülle (`199,90`) göstermesi normaldir.
* **CSV dosyasını Excel'de açarken** Türkçe karakterlerin bozulmaması için "Veri → Metinden / CSV'den" yoluyla açıp dosya kaynağını **UTF-8** seçin. Çift tıklayıp açarsanız ğ, ş, ı gibi harfler bozuk görünebilir.
* **Formül koruması:** `=`, `+`, `-`, `@` ile başlayan hücrelere tırnak eklenir; böylece dosya Excel'de açıldığında hücre içindeki içerik bir formül gibi çalışmaz.
* **JSON** dosyası CSV'den daha ayrıntılıdır (iç içe bilgiler vardır). Çoğu zaman bir geliştiriciye veya başka bir sisteme aktarım için gerekir ([JSON](term:json)).
* Siparişler dosyasında müşteri takip bağlantısının gizli kodu yer almaz.
* Her dışa aktarma [denetim kaydına](/help/security#denetim-kaydi) yazılır ("export").

### Yapılandırma yedeği ve gizli anahtarlar

Yapılandırma dosyası, mağazanızın "ayar fotoğrafı"dır: ad, logo, SEO, bildirim şablonları, yasal metinler ve entegrasyonların hangilerinin açık olduğu. İçinde **hiçbir gizli anahtar yoktur** (API anahtarı, jeton, şifre). Bu iyi bir güvenlik özelliğidir ama bir sonucu vardır: bu dosyayı başka bir mağazaya veya yedekten geri yüklediğinizde entegrasyon anahtarlarını **elle yeniden girmeniz gerekir**. Bu yüzden anahtarları güvenli bir yerde (parola yöneticisi) ayrıca saklayın. Bkz. [Gizli anahtarlar](/help/security#gizli-anahtarlar).

> [!NOTE]
> Yapılandırma dışa aktarması bir **yedek** ve **belge** niteliğindedir; panelde "yapılandırmayı içe aktar" düğmesi yoktur. Ayarları geri yüklemek gerektiğinde dosyaya bakarak ilgili sekmelerde değerleri yeniden girersiniz.

## İçe aktarma

**Veri aktarımı → Ürünleri içe aktar (CSV)** kartı, bir tablodaki ürünleri mağazanıza toplu olarak ekler veya günceller. Yüzlerce ürününüz varsa tek tek girmekten çok daha hızlıdır.

> [!TIP]
> En kolay yol: Önce mevcut ürünlerinizi **Ürünler → CSV** olarak dışa aktarın. Bu dosya doğru sütun adlarına sahip hazır bir şablondur. Excel'de yeni satırlar ekleyin veya mevcut satırları düzenleyin, **CSV UTF-8** olarak kaydedin ve içe aktarın.

### Adımlar

1. **Veri aktarımı** sayfasında **İçe aktar** kartına gidin.
2. **Dosya seç**'e basın ve hazırladığınız `.csv` dosyasını seçin (en çok **2 MB**).
3. **İçe aktar**'a basın.
4. İşlem bitince özet alırsınız: kaç ürün **oluşturuldu**, kaç ürün **güncellendi** ve hatalı satırlar için (ürün adresi + hata mesajı) liste.
5. Hata varsa dosyayı düzeltip yeniden yükleyin; başarılı olanlar tekrar güncellenir, yeni kayıt kopyalanmaz.

### Sütunlar

İlk satır sütun adlarıdır. Sütun adları büyük/küçük harfe duyarlı değildir. **Zorunlu olanlar: `slug` ve `sku`** (ve her satır için `price`).

| Sütun | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| `slug` | Ürünün adresi: küçük harf, rakam, tire | `seramik-vazo` | **Zorunlu.** Aynı slug'a sahip satırlar aynı ürünün çeşitleri sayılır |
| `name_tr` | Türkçe ürün adı | `Seramik vazo` | Boşsa slug ad olarak kullanılır |
| `name_en` | İngilizce ürün adı | `Ceramic vase` | İsteğe bağlı |
| `status` | `draft` (taslak), `active` (yayında) veya `archived` (arşivde) | `active` | Boşsa **taslak** olur. Yeni ürünler yayına girmez, kontrol sizin |
| `category_slug` | Kategorinin adresi | `ev-dekorasyon` | Önce kategori mevcut olmalı; bulunamazsa ürün kategorisiz kalır, hata vermez |
| `brand` | Marka | `Atölye Mavi` | İsteğe bağlı |
| `tax_rate` | KDV oranı, 0-100 tam sayı | `20` | Boş bırakırsanız ürüne özel oran girilmemiş olur |
| `sku` | [Stok kodu](term:sku), çeşit başına benzersiz | `VAZO-S-KREM` | **Zorunlu.** Mevcut bir SKU eşleşirse o çeşit güncellenir |
| `barcode` | Barkod | `8690000000012` | İsteğe bağlı; Trendyol'da genelde gerekir |
| `variant_title` | Çeşidin adı | `Küçük / Krem` | Tek çeşitli ürünlerde boş olabilir |
| `price` | Web sitesi fiyatı, ana birimle | `249.90` | **Her satırda zorunlu.** Nokta veya virgül kabul edilir; negatif olamaz |
| `compare_at_price` | Üstü çizili eski fiyat | `299.90` | Boş bırakırsanız **temizlenir** |
| `trendyol_price` | [Kanal fiyatı](term:channelprice) (Trendyol) | `279.90` | Boş bırakırsanız Trendyol fiyatı **silinir** |
| `stock` | Stok adedi | `12` | Boşsa stok **değişmez**; doluysa stok bu sayıya ayarlanır ve defterde görünür |
| `safety_stock` | [Güvenlik stoku](term:safetystock) | `2` | Yalnızca `stock` doluyken işlenir |
| `weight_grams` | Ağırlık (gram) | `850` | İsteğe bağlı |

Örnek: iki çeşitli bir ürün (aynı `slug`, iki satır):

```
slug,name_tr,status,category_slug,tax_rate,sku,variant_title,price,stock
seramik-vazo,Seramik vazo,active,ev-dekorasyon,20,VAZO-S-KREM,Küçük / Krem,249.90,12
seramik-vazo,Seramik vazo,active,ev-dekorasyon,20,VAZO-B-MAVI,Büyük / Mavi,349.90,5
```

Ürün düzeyindeki bilgiler (ad, durum, kategori, marka, KDV) için **o ürünün ilk satırı** esas alınır.

### Mevcut ürünlere ne olur?

* `slug` mevcutsa ürün **güncellenir**; yoksa yeni ürün **oluşturulur**.
* SKU eşleşen çeşitler güncellenir, yeni SKU'lar yeni çeşit olur.
* Mevcut bir ürünün dosyada **olmayan çeşitleri silinmez, pasifleştirilir** (sipariş geçmişi bozulmasın diye).
* Mevcut ürünün **görselleri korunur**; CSV ile görsel eklenmez. Yeni ürünlere görselleri sonra ürün sayfasından eklersiniz ([Ürün görselleri](/help/catalog#urun-gorselleri)).
* Dosyada olmayan ürünler **silinmez**.
* İçe aktarma Trendyol bağlıysa stok ve fiyat güncellemesini pazaryerine de iletir.

> [!WARNING]
> **Boş hücre bazı alanlarda "temizle" anlamına gelir.** `compare_at_price` ve `trendyol_price` boş bırakılırsa mevcut değer silinir. Mevcut ürünleri güncellerken bu sütunları dışa aktarılan dosyadan alıp değiştirmeden bırakın; sütunu hiç boş bırakmayın veya silmeyin. `stock` boşsa ise stok değişmez.

> [!DANGER]
> **Fiyat ve stoklar canlıda hemen değişir.** İçe aktarma, yayındaki ürünlerin fiyatını ve stokunu anında günceller. Büyük bir dosyayı yüklemeden önce mutlaka **Ürünler → CSV** ile yedek alın ve önce 2-3 satırlık küçük bir dosyayla deneyin. Geri alma düğmesi yoktur.

### Sık görülen içe aktarma hataları

| Mesaj (özet) | Anlamı | Çözüm |
|---|---|---|
| CSV dosyası zorunlu | Dosya seçilmedi | Dosyayı seçip tekrar deneyin |
| Dosya 2 MB'ı aşıyor | Dosya çok büyük | Dosyayı iki parçaya bölün |
| CSV `slug` ve `sku` sütunlarını içermeli | Başlık satırında bu sütunlar yok | İlk satıra `slug` ve `sku` ekleyin; virgülle ayrıldığından emin olun |
| `Invalid price for sku ...` | Fiyat boş, sayı değil veya negatif | O satırın `price` değerini düzeltin |
| Aynı SKU / adres başka kayıtta kullanılıyor | SKU veya slug çakışması | Benzersiz bir değer yazın |
| Doğrulama hatası (satır özelinde) | Slug biçimi hatalı (boşluk, büyük harf, Türkçe karakter) | Slug'ı `kucuk-harf-ve-tire` biçiminde yazın |

Her satır ürün bazında ayrı denendiği için hatalı bir ürün diğerlerinin içe aktarılmasını engellemez.

## Yedekleme

Mağaza verileriniz (ürünler, siparişler, müşteriler, ayarlar) Cloudflare'deki [D1 veritabanında](term:d1) durur. İki tür yedek düşünün:

| Yedek | Nasıl | Ne içerir | Ne zaman |
|---|---|---|---|
| **Panel dışa aktarmaları** | **Veri aktarımı** sayfası | Ürünler, siparişler, müşteriler, yapılandırma (gizli anahtarlar hariç) | Haftalık veya önemli değişikliklerden önce |
| **Tam veritabanı yedeği** | Komut satırı | Veritabanının tamamı | Aylık veya büyük güncelleme/ürün içe aktarmadan önce |

Panel dışa aktarmaları kolaydır ama bir "geri yükle" düğmesi yoktur; esas olarak kayıt tutma, Excel'de inceleme ve ürünleri geri yüklemek için işe yarar.

### Tam veritabanı yedeği

Bu işlem için teknik bilgi (veya yardım edecek biri) gerekir. Projenin `workers/api` klasöründe şu komut kullanılır:

```
npx wrangler d1 export openshelf --remote --output=backup.sql
```

Bu komut veritabanının tamamını `backup.sql` dosyasına yazar. Bu proje belgelerinin önerdiği yöntemdir; komutun güncel seçeneklerini Cloudflare'in Wrangler belgelerinden doğrulayın (doğrulanacak: komut ve bayrakların güncel biçimi).

> [!DANGER]
> `backup.sql` dosyası **tüm müşteri kişisel verilerini** içerir. Şifreli bir yerde saklayın, erişimi kısıtlayın ve eski kopyaları silin. Telefonunuza, e-postanıza veya herkese açık bulut klasörüne koymayın.

Cloudflare D1'in belirli bir geçmiş ana dönmeyi sağlayan "Time Travel" özelliği vardır; ancak geri dönebileceğiniz süre planınıza göre değişir ve Cloudflare tarafından değiştirilebilir. Güncel süreyi Cloudflare D1 belgelerinden kontrol edin (doğrulanacak). Bu özelliği tek yedek olarak düşünmeyin.

**Düzenli bir yedek alışkanlığı için:**

1. Haftada bir **Ürünler**, **Siparişler**, **Müşteriler** ve **Yapılandırma** dosyalarını dışa aktarın.
2. Ayda bir (ve her büyük güncellemeden önce) tam veritabanı yedeği alın.
3. Yedekleri şifreli, ayrı bir yerde saklayın ve eski kopyaları silin.
4. Zaman zaman bir yedeğin **gerçekten açılıp okunabildiğini** deneyin; geri yükleyemediğiniz yedek yedek sayılmaz. Deneme için asıl mağazanızı değil, ayrı bir deneme veritabanını kullanın.
5. Entegrasyon anahtarlarınızı ve `APP_ENCRYPTION_KEY` değerini parola yöneticisinde ayrıca saklayın; yapılandırma yedeği bunları içermez.

### Yedek alınması gereken anlar

* Toplu ürün içe aktarmadan önce
* Mağazayı güncellemeden (yeni sürüm yüklemeden) önce
* Ana şifreleme anahtarını değiştirmeden önce ([Gizli anahtarlar](/help/security#gizli-anahtarlar))
* Müşteri anonimleştirme gibi geri alınamaz işlemlerden önce (yedeğin kendisi de kişisel veri taşıyacağı için dikkatli olun)

## Sık yapılan hatalar

* **CSV'yi Excel'de çift tıklayıp açıp kaydetmek.** Türkçe karakterler bozulur. UTF-8 olarak açın ve **CSV UTF-8** olarak kaydedin.
* **Başlık satırını silmek veya sütun adını değiştirmek.** `slug` ve `sku` zorunludur.
* **Fiyatı kuruşla yazmak.** `24990` yazarsanız 24.990 ₺ olur; `249.90` yazın.
* **`trendyol_price` veya `compare_at_price` sütununu boş bırakmak.** Mevcut değerleri siler.
* **Önce yedek almadan büyük dosya yüklemek.**
* **Yedek dosyasını herkese açık bir yerde paylaşmak.**
* **Yedeğin yalnızca panel dışa aktarmaları olduğunu sanmak.** Tam veritabanı yedeği ayrıdır.
* **Yedeği hiç denememek.**
