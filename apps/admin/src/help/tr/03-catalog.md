# Katalog: ürünler, kategoriler, stok

Bu bölümde mağazanızda sattığınız her şeyi nasıl tanımlayacağınızı öğrenirsiniz: ürün ve varyant ekleme, ürün adresi ([slug](term:slug)) ve stok kodu ([SKU](term:sku)), fiyatlar ve kanal fiyatları, stok ve stok düzeltme, görseller, kategoriler ve indirim kuponları. Örneklerde **Seramik Vazo** adlı bir ürünü, **VAZO-S-KREM** (küçük boy, krem rengi) stok koduyla kuracağız.

Katalog üç ekrandan yönetilir: **Ürünler**, **Kategoriler** ve **Kuponlar**. Hepsi sol menüde **Mağaza** grubundadır.

## Ürün ekleme

![Ürün listesi](help/tr/products-list.png)

**Ürünler** sayfası tüm ürünleri durumları, varyant sayıları, fiyatları ve stoklarıyla gösterir. Üstteki **Ara** kutusu ürün adı veya SKU ile arar; **Durum** ve **Kategori** filtreleriyle listeyi daraltabilirsiniz.

### Yeni ürün oluşturma (adım adım)

1. Sol menüden **Ürünler**'e, sağ üstten **Yeni ürün**'e tıklayın.
2. **Ayrıntılar** kartında **Ad**'ı yazın (örnek: `Seramik Vazo`). Ürün adresi (slug) siz yazdıkça otomatik oluşur.
3. **Açıklama** alanına ürünü anlatın: malzeme, ölçü, bakım bilgisi. Müşteri ve arama motorları bu metni okur.
4. **Varyantlar ve fiyatlar** kartında en az bir varyant tanımlayın (aşağıya bakın): **Başlık**, **Stok kodu (SKU)**, **Web sitesi fiyatı**, **Başlangıç stoku**.
5. **Görseller** kartından fotoğraf yükleyin ve her birine açıklama (alt metin) yazın.
6. **Durum ve kategori** kartından **Durum** (Taslak / Aktif / Arşivlenmiş) ve **Kategori** seçin.
7. **Arama ve sosyal medya (SEO)** kartında arama sonucu önizlemesine bakın; gerekirse başlık ve açıklamayı özelleştirin.
8. Sağ üstteki **Kaydet** düğmesine basın.

![Ürün düzenleme sayfası](help/tr/product-edit.png)

**Kaydet** düğmesi; ad, ürün adresi, en az bir varyant, her varyant için başlık, SKU ve web fiyatı dolu olmadan aktif olmaz.

### Alan alan açıklama

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Ad** (zorunlu) | Müşterinin gördüğü ürün adı | Seramik Vazo | En fazla 300 karakter. |
| **Ürün adresi (slug)** | Ürünün web adresindeki kısa ad | `seramik-vazo` | Sadece küçük harf, rakam ve tire. Ayrıntı için [aşağıdaki bölüme](/help/catalog#urun-adresi-slug) bakın. |
| **Açıklama** | Ürün tanıtımı | El yapımı, 22 cm… | Dolu açıklama arama motoru görünümünü iyileştirir. |
| **Durum** | **Taslak**: yalnızca yönetimde görünür. **Aktif**: vitrinde satışta. **Arşivlenmiş**: satıştan kaldırılmış, kayıtlar saklanır | Aktif | Yeni ürün **Taslak** başlar. Hazır olunca **Aktif** yapın. |
| **Kategori** | Ürünün bulunacağı kategori | Vazolar | Boş bırakılabilir ("Yok"). |

> [!TIP]
> Henüz hazır olmayan bir ürünü silmek yerine **Taslak** bırakın. Satışı durdurmak istediğiniz ürünü silmek yerine **Arşivlenmiş** yapın: geçmiş siparişler ve faturalar o ürüne bağlıdır ve korunur.

### Sık yapılan hatalar (ürün ekleme)

- **Ürünü Aktif yapmayı unutmak:** Taslak ürün vitrinde görünmez.
- **Fiyatı boş bırakmak:** Web fiyatı olmayan varyant kaydedilemez.
- **Stok girmeden aktif etmek:** Ürün vitrinde "stokta yok" görünür ve satılamaz.
- **Görselsiz yayınlamak:** Hem satışı hem arama sonucu görünümünü zayıflatır.

## Ürün adresi (slug)

**Slug**, ürünün web adresinde görünen kısa addır: `magazaniz.com/product/seramik-vazo` adresindeki `seramik-vazo` kısmı. Ürün adını yazdıkça otomatik üretilir; Türkçe karakterler sadeleştirilir ("Çiçek Saksısı" → `cicek-saksisi`). İsterseniz **Arama ve sosyal medya (SEO)** kartındaki adres alanından elle düzenleyebilirsiniz.

Kurallar:

- Yalnızca küçük harf (a–z), rakam ve tire (-) kullanılabilir.
- Her ürünün adresi benzersiz olmalıdır; aynı adres ikinci kez kullanılırsa "zaten var" hatası alırsınız.
- Kısa, anlaşılır ve ürünü anlatan olsun (`seramik-vazo`, `vazo-1234` değil).

### Slug'ı sonradan değiştirirseniz

Yayındaki bir ürünün adresini değiştirdiğinizde ekranda sarı bir uyarı çıkar. Sistem eski adresi yeni adrese otomatik olarak **kalıcı yönlendirir** ([301 yönlendirmesi](term:redirect301)). Böylece eski bağlantıyı paylaşmış müşteriler ve Google, yeni sayfaya ulaşır; "sayfa bulunamadı" görmezler. Yönlendirme zincirleri ve döngüler sistem tarafından temiz tutulur.

> [!WARNING]
> Çok sık slug değiştirmeyin. Yönlendirme olsa bile arama motorunun yeni adresi tanıması zaman alır; sıralamanızda geçici düşüş olabilir. Reklam bağlantılarınız, QR kodlarınız ve basılı malzemelerinizdeki adresler de eski adresi kullanmaya devam eder. Yönlendirmeleri [SEO bölümünde](/help/seo#adres-yonlendirmeleri) yönetebilirsiniz.

## Varyantlar ve stok kodu

Bir **ürün**, müşterinin satın aldığı farklı **seçenekleri** (varyant) barındırır. Seramik Vazo'yu küçük ve büyük boy, krem ve mavi renkle satıyorsanız her kombinasyon ayrı bir varyanttır. Her varyantın kendi stoğu, fiyatı ve stok kodu vardır. Sistem, stoğu ve siparişi her zaman **varyant düzeyinde** takip eder. Ayrıntı için sözlükte [Varyant](term:variant) tanımına bakın.

Ürününüz tek çeşitse yine de **bir** varyant tanımlarsınız (örneğin başlık: "Standart").

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Başlık** (zorunlu) | Varyantı ayırt eden ad | Küçük / Krem | Müşteri ve sipariş satırlarında görünür. |
| **Stok kodu (SKU)** (zorunlu) | Sizin verdiğiniz benzersiz stok kodu | `VAZO-S-KREM` | Her varyantta farklı olmalıdır. Aynı SKU iki kez kullanılırsa kayıt reddedilir. |
| **Barkod** | Ürünün barkodu (EAN-13, UPC) | 8691234567890 | Trendyol entegrasyonu için **gereklidir**. Bkz. [barkod](term:barcode). |
| **Seçenekler** | Anahtar=Değer çiftleri, virgülle ayrılmış | `Renk=Krem, Boy=S` | Varyantı tanımlayan özellikler. |
| **Web sitesi fiyatı** (zorunlu) | Vitrindeki satış fiyatı | 349,90 | Virgüllü yazın. Fiyat **Genel** ayarındaki KDV dahil/hariç seçimine göre yorumlanır. |
| **Trendyol fiyatı** | Pazaryerindeki fiyat | 379,90 | Bkz. [Kanal fiyatları](/help/catalog#kanal-fiyatlari). |
| **Başlangıç stoku** | Yeni varyant için başlangıç stoğu | 12 | Yalnızca yeni varyantta görünür; sonradan **Stoku düzenle** kullanılır. |

### SKU nasıl seçilir?

[SKU](term:sku) bir ürünün envanterinizdeki "kimlik numarası"dır. İyi bir SKU kısa, okunabilir ve değişmez olur:

- `VAZO-S-KREM` = Vazo, Small, Krem. `VAZO-L-MAVI` = Vazo, Large, Mavi.
- Büyük harf, rakam ve tire kullanın; boşluk ve Türkçe karakterden kaçının.
- SKU'yu sipariş verildikten sonra değiştirmekten kaçının. Trendyol'daki ürün eşleşmesi ve faturalar bu koda dayanır.

### Varyant ekleme ve çıkarma

- **Varyant ekle** düğmesi yeni bir satır açar.
- Henüz kaydedilmemiş bir varyantı **Kaldır** ile silebilirsiniz.
- Kaydedilmiş bir varyantı ürün formundan çıkarırsanız silinmez, **pasif** hale getirilir; çünkü geçmiş siparişler ona bağlıdır.

### Sık yapılan hatalar (varyantlar)

- **Aynı SKU'yu iki varyantta kullanmak.**
- **Seçenekleri yanlış biçimde yazmak:** `Renk=Krem, Boy=S` biçimini kullanın.
- **Barkodsuz Trendyol'da satmaya çalışmak:** Barkodu olmayan varyant Trendyol'a gönderilemez ("eksik barkod" hatası kaydedilir).
- **KDV dahil/hariç karışıklığı:** Fiyat girerken **Mağaza ayarları → Genel → Fiyatlara KDV dahil** seçimini bilin.

## Stok ve stok defteri

Sistem her varyant için üç sayı tutar:

| Kavram | Anlamı |
|---|---|
| **Toplam stok** | Rafta fiziksel olarak bulunan adet. |
| **Ayrılmış (rezerve)** | Ödemeye geçmiş ama henüz ödemesi tamamlanmamış sepetler için geçici olarak ayrılan adet. |
| **Güvenlik stoğu** | Satışa kapalı tuttuğunuz tampon adet (**Mağaza ayarları → Ödeme ve sipariş**). |

**Satılabilir stok = toplam − ayrılmış − güvenlik stoğu.** Müşteri vitrinde bu sayıyı görür/bu sayıya kadar satın alabilir. Örneğin toplam 5, ayrılmış 1, güvenlik stoğu 1 ise vitrinde en fazla 3 adet satılabilir.

### Stok nasıl hareket eder?

| Olay | Stoğa etkisi |
|---|---|
| Müşteri ödemeye geçer | Satılabilir stok düşer (ayrılmış artar). Süre dolarsa geri döner. |
| Ödeme başarılı | Ayrılan adet kalıcı olarak **toplam stoktan düşülür** ("satış"). |
| Süre dolar / ödeme öncesi iptal | Ayrılan adet serbest kalır. Stok değişmez (zaten düşülmemişti). |
| Ödenmiş siparişi iptal etme (kargolanmadan) | Adetler stoğa **geri eklenir** ("iade/geri alma"). |
| Siparişi **İade edildi** yapma | Stok **otomatik artmaz**; ürün size döndüyse stoğu elle düzeltmeniz gerekir. |
| Trendyol'dan gelen sipariş | Toplam stoktan düşer ("Trendyol satışı"). |
| Elle düzeltme | Yaptığınız artış/azalış kadar değişir. |

> [!NOTE]
> Kargolanmış siparişi iptal edemezsiniz; geri dönüş için **İade** akışını kullanırsınız. İade sonrası ürünü yeniden satışa koymak istiyorsanız stoğu elle artırın.

### Stoğu elle düzeltme (adım adım)

1. **Ürünler** → ilgili ürünü açın.
2. **Varyantlar ve fiyatlar** kartında varyantın **Stok: 12 (1 ayrılmış)** satırının yanındaki **Stoku düzenle** düğmesine tıklayın.
3. Açılan pencerede **Değişiklik (+/-)** alanına artış için `10`, azalış için `-3` yazın.
4. **Gerekçe** alanına kısa bir açıklama yazın ("Sayım farkı", "Kırık ürün", "Yeni mal girişi").
5. **Uygula**'ya basın.

Toplam stok, ayrılmış adetin altına düşürülemez: "Stok, ayrılmış miktarın altına inemez" hatası alırsınız; ayrılmış sepetler bitince tekrar deneyin. Değişiklik `0` olamaz ve neden yazmak zorunludur.

### Stok defteri nedir?

Her stok hareketi (satış, geri alma, elle düzeltme, Trendyol satışı) sistemde **değiştirilemez bir kayıt** olarak tutulur: hangi varyant, kaç adet, hangi nedenle, ne zaman. Buna [stok defteri](term:ledger) denir. Sayımda "stok neden böyle?" sorusunu cevaplamak içindir. Elle düzeltmeleriniz ayrıca **Denetim kaydı**'nda (kim, ne zaman, neden) görünür. Şu an panelde ayrı bir stok defteri ekranı yoktur.

**Genel bakış** ekranında **Azalan stok** kartı, satılabilir adedi 5 ve altına düşen varyantları listeler. Ayrıca bir **Stok sapması** kartı, ayrılmış adedin kayıtlarla uyuşmadığı durumları gösterir; böyle bir kayıt görürseniz destek ekibinize/geliştiricinize bildirin.

### Sık yapılan hatalar (stok)

- **Fiziksel sayımı sisteme yansıtmamak.** Aylık sayım yapın; fark varsa **Stoku düzenle** ile nedenini yazarak düzeltin.
- **Negatif stok bekleyip beklememek:** Sistem satılabilir stoğun altında satışa izin vermez; fazla satış (oversell) engellenir.
- **İade sonrası stoğu artırmayı unutmak.**
- **Trendyol ve web stoklarını ayrı yönetmek:** Stok tek yerden (bu sistemden) yönetilmelidir.

## Kanal fiyatları

Aynı ürünü farklı satış kanallarında farklı fiyata satabilirsiniz. Her varyantın her **kanal** için ayrı bir fiyatı olur ([kanal fiyatı](term:channelprice)). Şu an iki kanal vardır:

| Kanal | Alan | Ne için |
|---|---|---|
| Web sitesi | **Web sitesi fiyatı** (zorunlu) | Vitrinde müşterinin ödediği fiyat |
| Trendyol | **Trendyol fiyatı** | Trendyol'a gönderilen satış fiyatı (komisyonu hesaba katarak farklı belirleyebilirsiniz) |

**Trendyol fiyatı** boş bırakılırsa o varyant için Trendyol fiyatı tanımlanmamış olur (alanı sildiğinizde kayıt da silinir). Ürünü kaydettiğinizde ve stoğu değiştirdiğinizde sistem arka planda Trendyol'a stok/fiyat gönderimi işi ekler (dakikada bir birleştirilir).

> [!WARNING]
> Trendyol fiyatları ve stokları, yalnızca Trendyol entegrasyonu açıkken ve ilgili varyantın barkodu olduğunda gönderilir. Bu sürümde ürün ekranında "Trendyol'da listele" gibi bir anahtar yoktur; gönderimin gerçekten yapıldığını **Entegrasyon olayları** ekranından ve Trendyol satıcı panelinizden doğrulayın. Ayrıntı ve uyarılar için [Trendyol](/help/integrations#trendyol) bölümüne bakın.

Kargo ücreti ve ücretsiz kargo eşiği kanal fiyatından bağımsızdır; **Mağaza ayarları → Ödeme ve sipariş**'ten ayarlanır.

## Ürün görselleri

**Görseller** kartından ürününüze en fazla 30 fotoğraf ekleyebilirsiniz. Birinci görsel ürünün kapak fotoğrafıdır; vitrinde ve sosyal medya paylaşımında ilk o görünür.

### Görsel ekleme

1. **Yükle** düğmesine tıklayıp bilgisayarınızdan dosya seçin (PNG, JPEG, WebP, GIF veya AVIF; varsayılan olarak en fazla 1,5 MB). **veya**
2. **Adresle ekle** alanına `https://…` ile başlayan bir görsel adresi yazıp **Adresi ekle**'ye basın.
3. Her görselin yanındaki **Alternatif metin: görseli tarif edin** alanını doldurun (aşağıya bakın).
4. **Yukarı** / **Aşağı** düğmeleriyle sırayı değiştirin; **Kaldır** ile silin.
5. Ürünü **Kaydet**'in.

### Alt metin neden önemlidir?

[Alt metin](term:alttext), görseli göremeyen ziyaretçiler (ekran okuyucu kullananlar) ve arama motorları için görselin yazılı tarifidir. Boş bırakılan alanın kenarlığı sarı görünür. İyi alt metin kısa ve somut olur: "Krem renkli, 22 cm yüksekliğinde seramik vazo". "Resim1" veya "vazo vazo vazo" gibi yazmayın.

### Görsel ipuçları

- Tüm ürünlerde aynı en-boy oranını kullanın (örneğin kare).
- Arka plan sade ve ışık yeterli olsun; ürünü farklı açılardan gösteren 3–5 fotoğraf idealdir.
- Dosyaları yüklemeden önce küçültün. 1,5 MB'ı aşan dosyalar reddedilir.
- Başkasının sitesinden URL ile görsel eklemek, o site görseli kaldırırsa görselin kaybolmasına yol açar; mümkünse dosyayı yükleyin.

## Kategoriler

![Kategoriler sayfası](help/tr/categories.png)

Kategoriler, ürünlerinizi vitrinde gruplamanızı sağlar (Vazolar, Tabaklar, Hediyelik…). Bir kategori başka bir kategorinin altında olabilir (üst kategori).

### Kategori oluşturma

1. Sol menüden **Kategoriler**'e, ardından **Yeni kategori**'ye tıklayın.
2. **Ad**'ı yazın (örnek: `Vazolar`); kategori adresi (slug) otomatik oluşur.
3. İsterseniz **Üst kategori** seçin ("Yok" bırakırsanız ana kategori olur).
4. **Kaydet**'e basın.

Tabloda her kategorinin adı, adresi ve üst kategorisi görünür; **Düzenle** ve **Sil** düğmeleri satırın sonundadır.

| Alan | Ne yazılır | Dikkat |
|---|---|---|
| **Ad** | Kategori adı | En fazla 200 karakter. |
| **Üst kategori** | Bağlı olduğu kategori | Kendisini üst kategori seçemezsiniz. |
| **Adres (slug)** | `vazolar` | Ürün adresi kuralları geçerlidir. Değiştirirseniz eski adres otomatik yönlendirilir. |

> [!WARNING]
> Bir kategoriyi sildiğinizde içindeki ürünler silinmez; **kategorisiz** kalır ve vitrinde o kategoride artık görünmez. Silmeden önce ürünleri başka kategoriye taşıyın.

## Kuponlar

![Kuponlar sayfası](help/tr/coupons.png)

Kuponlar, müşterinin sepette girdiği indirim kodlarıdır.

### Kupon oluşturma

1. Sol menüden **Kuponlar**'a, ardından **Yeni kupon**'a tıklayın.
2. **Kod**'u yazın (örnek: `HOSGELDIN10`). Otomatik büyük harfe çevrilir; harf, rakam, tire ve alt çizgi kullanılabilir (2–40 karakter).
3. **Tür**'ü seçin: **Yüzde** veya **Tutar**.
4. **Yüzde** veya **Tutar** alanına değeri yazın (örnek: `10` = %10; sabit tutarda `50` = 50 ₺).
5. İsterseniz **Asgari sepet tutarı**, **En çok kullanım** ve **Bitiş tarihi** girin.
6. **Aktif** anahtarını açık bırakın ve **Kaydet**'e basın.

| Alan | Anlamı | Örnek |
|---|---|---|
| **Kod** | Müşterinin gireceği kod | `HOSGELDIN10` |
| **Tür** | Yüzde: sepet ara toplamının yüzdesi. Sabit tutar: düz indirim | Yüzde |
| **Yüzde / Tutar** | İndirim değeri; yüzde en fazla 100 | 10 |
| **Asgari sepet tutarı** | Kuponun geçerli olması için gereken en az ara toplam | 500 |
| **En çok kullanım** | Toplam kaç siparişte kullanılabileceği (boş = sınırsız) | 100 |
| **Bitiş tarihi** | Bu tarihten sonra geçersiz | 31.12.2026 |
| **Aktif** | Kapatırsanız kupon çalışmaz ama silinmez | Açık |

### Kupon nasıl işler?

- İndirim, **sepet ara toplamından** düşülür; sepet tutarından fazla olamaz. Kargo ücreti indirimden sonraki tutara göre hesaplanır (ücretsiz kargo eşiği indirimli tutara bakar).
- Sipariş oluşturulduğunda kuponun "kullanım sayısı" artar. Ödenmemiş sipariş iptal olursa veya rezervasyon süresi dolarsa kullanım hakkı **geri verilir**.
- **Aynı e-posta adresi bir kuponu varsayılan olarak yalnızca bir kez kullanabilir.** İptal edilmemiş bir siparişte o kuponu zaten kullanmış müşteri, ikinci denemede "Bu kupon bu e-posta ile zaten kullanıldı" uyarısı alır. (Müşteri başına limit sistemde ayarlanabilir bir alandır; bu panelde şu an düzenlenmez.)
- Geçersiz, süresi dolmuş, kullanım limiti dolmuş veya asgari tutara ulaşmamış kupon girildiğinde müşteri neden belirten bir uyarı görür.

> [!TIP]
> Yeni bir kuponu önce kendiniz denemek için düşük bir "En fazla kullanım" (örneğin 1) ve yakın bir son kullanma tarihiyle başlayın; çalıştığını görünce limitleri artırın.

### Sık yapılan hatalar (kuponlar)

- **%100'den büyük yüzde yazmak:** Kayıt reddedilir.
- **Sabit tutar ile yüzdeyi karıştırmak:** `50` yazıp türü **Yüzde** bırakırsanız %50 indirim verirsiniz.
- **Süresi dolmuş kuponu etkin sanmak:** Tarihi geçen kupon çalışmaz, listede **Aktif** görünse bile.
- **Kuponu silmek:** Geçmiş siparişler korunur; ancak kod artık kullanılamaz. Geçici durdurmak için **Aktif**'i kapatın.
