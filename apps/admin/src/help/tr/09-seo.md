# SEO (arama motoru görünürlüğü)

Bu bölümde müşterilerin Google gibi arama motorlarında sizi nasıl bulduğunu, ürün ve kategori sayfalarınızın arama sonucunda ve paylaşımlarda nasıl görüneceğini, adres değiştirdiğinizde eski bağlantıların nasıl korunduğunu ve mağazanızı arama motorlarına ne zaman açmanız gerektiğini öğreneceksiniz.

SEO'nun sihirli bir yanı yoktur: arama motoru sayfanıza bakar, başlığını ve açıklamasını okur ve sonuçlarda gösterir. OpenShelf bu "okunan kısmı" sizin için doğru biçimde hazırlar; sizin işiniz anlaşılır başlıklar ve açıklamalar yazmaktır. Sonuçlar saatler değil, çoğu zaman haftalar içinde oluşur.

> [!NOTE]
> Arama motorlarının kuralları ve sıralama yöntemleri sürekli değişir. Burada anlatılanlar iyi uygulamalardır; belirli bir sıralama garantisi vermez.

## Nereden yönetilir?

| Ne | Nerede |
|---|---|
| Tek bir ürünün başlığı, açıklaması, paylaşım görseli, kanonik adresi, gizleme anahtarı | Ürünü düzenle sayfasındaki **SEO** bölümü |
| Kategori başlığı, açıklaması, paylaşım görseli, gizleme anahtarı | Kategoriyi düzenle sayfası |
| Ana sayfa başlığı ve açıklaması, başlık şablonu, tüm site için arama motoru anahtarı, doğrulama kodları | **Mağaza ayarları → SEO** |

![Mağaza ayarları, SEO sekmesi](help/tr/settings-seo.png)

![Ürün düzenleme, SEO bölümü](help/tr/product-seo.png)

Her iki ekranda da yazdıkça **arama sonucu önizlemesi** güncellenir. Önizleme Google'ın sonucu nasıl keseceğini ve paylaşımda sayfanın nasıl görüneceğini yaklaşık olarak gösterir.

## Başlık ve açıklama

Bir sayfanın arama sonucundaki **mavi başlığı** ve altındaki **gri açıklaması** iki ayrı alandır. Müşteri çoğunlukla bu iki satıra bakarak tıklar, bu yüzden en değerli yazılar bunlardır.

### Ne yazılır?

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| SEO başlığı | Sayfayı tarif eden kısa, doğal başlık | `El yapımı seramik vazo, krem` | Boş bırakırsanız ürün adı kullanılır. 60 karakteri geçmemeye çalışın |
| SEO açıklaması | Müşteriyi tıklamaya ikna eden 1-2 cümle | `Fırınlanmış toprak, mat krem sır. 24 cm yüksekliğinde, her biri elde şekillenir. 2-3 iş gününde kargoda.` | Boş bırakırsanız ürün açıklamasının başı kullanılır. 120-155 karakter idealdir |
| Paylaşım görseli | Sayfa WhatsApp'ta paylaşılınca çıkan resim | Ürünün temiz bir fotoğrafı | Boşsa ürünün ilk fotoğrafı, o da yoksa mağazanın varsayılan görseli kullanılır |

### Uzunluk rehberi

Sayaç ekranda uzunluğu ve rengini gösterir:

| Alan | İyi | Dikkat | Sorunlu |
|---|---|---|---|
| Başlık | en fazla 60 karakter | 61-70 karakter (sonu kesilebilir) | 70'ten uzun |
| Açıklama | 120-155 karakter | daha kısa (120 altı) veya 156-320 arası (sonu kesilir) | 320'den uzun |

Sistem başlığı 70, açıklamayı 320 karakterle sınırlar; ancak Google çoğu zaman 155 karakter civarında keser. En önemli bilgiyi başa koyun.

### Başlık şablonu

**Mağaza ayarları → SEO → Başlık şablonu**, ürün, kategori ve içerik sayfalarındaki başlığın nasıl tamamlanacağını belirler. Varsayılanı:

```
%s | {storeName}
```

| Şablon değişkeni | Yerine ne gelir |
|---|---|
| `%s` | Sayfanın başlığı (ürün veya kategori adı ya da yazdığınız SEO başlığı) |
| `{storeName}` | Mağaza adınız |

Yani "Seramik Vazo" başlıklı ürün, "OpenShelf Demo" adlı mağazada arama sonucunda `Seramik Vazo | OpenShelf Demo` olarak görünür. Şablonda `%s` yoksa şablon uygulanmaz. Şablon başlığı uzattığı için ürün başlıklarını kısa tutun. [Şablon değişkeni](term:templatevar) terimini, bildirim mesajlarındaki farklı süslü parantezli değişkenlerle karıştırmayın; bunlar ayrı sistemlerdir.

### Ana sayfa

**Ana sayfa başlığı** ve **Ana sayfa açıklaması** boş bırakılırsa mağaza adı + sloganınız ve mağaza açıklamanız kullanılır. Marka adınızı ve ne sattığınızı tek cümlede söyleyen bir ana sayfa başlığı yazmak iyi bir başlangıçtır: `OpenShelf Demo – El yapımı seramik ve keten ev ürünleri`.

### İyi başlık için ipuçları

* Müşterinin aradığı kelimeyi kullanın: "Seramik vazo", "Keten yastık kılıfı".
* Her sayfanın başlığı farklı olsun; aynı başlığı onlarca ürüne yazmayın.
* Fazla sayıda anahtar kelimeyi art arda sıralamayın; doğal cümle kurun.
* Fiyat veya kampanya yazmayın; değiştiğinde unutulur.

## Canonical ve noindex

Bu iki ayar sayfanın arama motorlarında nasıl sayılacağını belirler. Çoğu mağazanın bunlara dokunması gerekmez.

### Kanonik adres

[Kanonik adres (canonical)](term:canonical), aynı içeriğe birden fazla adres varsa arama motoruna "asıl adres bu" der. Varsayılan olarak ürün sayfasının kendi adresi kullanılır: `https://magazaniz.com/product/seramik-vazo`. Yalnızca özel bir durumda doldurun, örneğin aynı ürünü başka bir adreste de yayımlıyorsanız ve sıralamanın asıl adreste toplanmasını istiyorsanız. Adres mutlaka `https://` ile başlayan tam bir adres olmalı.

Kanonik adres girdiğiniz ürün, site haritasında kendi adresiyle değil bu adresle listelenir.

> [!WARNING]
> Yanlış bir kanonik adres, ürününüzün arama sonuçlarından kaybolmasına yol açabilir. Emin değilseniz boş bırakın.

### Arama motorlarından gizle (noindex)

[Arama motorlarından gizle](term:noindex), sayfayı adresiyle açılır tutar ama arama sonuçlarına girmesini engeller. Şunlar için uygundur: yayına hazır olmayan ürün, geçici kampanya sayfası, kopya sayfa.

Üç düzey vardır:

| Düzey | Nerede | Etkisi |
|---|---|---|
| Tek ürün / tek kategori | Ürünü veya kategoriyi düzenle sayfasındaki gizleme anahtarı | Yalnızca o sayfa listelenmez ve site haritasından çıkar |
| Tüm mağaza | **Mağaza ayarları → SEO → Arama motorlarının bu mağazayı indekslemesine izin ver** | Kapalıysa her sayfaya noindex eklenir ve tüm site gezilmeye kapatılır |
| Her zaman | Sepet, ödeme, sipariş sayfaları, içerik aramaları (`?q=`) | Otomatik; ayarlanamaz |

### Tüm mağaza için arama motoru anahtarı

Bu anahtar çok önemlidir. **Kapalıyken mağazanız Google ve diğer arama motorlarında hiç görünmez.** Demo mağazada varsayılan olarak kapalıdır; çünkü demo içerik arama sonuçlarında çıkmamalıdır. Siz de mağazayı hazırlarken kapalı tutabilirsiniz; ancak **yayına almadan önce mutlaka açın**. Ayar kapalıyken ekranda kırmızı bir uyarı görürsünüz.

> [!DANGER]
> En sık yapılan SEO hatası: mağaza yayına alınır ama arama motoru anahtarı kapalı kalır. Haftalarca satış olmayıp "neden Google'da yokuz" diye düşünülür. Yayına almadan önce [Yayın kontrol listesi](/help/going-live#yayin-kontrol-listesi)ni mutlaka uygulayın.

## Yapılandırılmış veri

[Yapılandırılmış veri (JSON-LD)](term:jsonld), sayfanın içine eklenen ve arama motorlarına "bu bir ürün, fiyatı şu, stokta var" gibi bilgileri makine diliyle ileten görünmez bir bloktur. Google bununla arama sonucunda fiyat ve stok bilgisini gösterebilir (zengin sonuç). OpenShelf bunu sizin yerinize otomatik üretir; **Mağaza ayarları → SEO → Yapılandırılmış veri (JSON-LD)** anahtarı açıkken çalışır.

| Sayfa | Eklenen veri türleri |
|---|---|
| Ana sayfa | Kuruluş (ad, logo, sosyal medya bağlantıları, iletişim bilgileri) ve Web sitesi (mağaza içi arama) |
| Ürün sayfası | Ürün (ad, açıklama, görseller, SKU, varsa geçerli barkod, marka) + Teklif (fiyat, para birimi, stokta var/yok) + ekmek kırıntısı yolu |
| Kategori ve ürün listesi | Koleksiyon sayfası, ürün listesi, ekmek kırıntısı yolu |

Birkaç ayrıntı:

* Ürünün çeşitleri farklı fiyatlıysa "en düşük - en yüksek fiyat" aralığı gönderilir.
* Fiyat, **web sitesi fiyatıdır**; Trendyol fiyatı dahil edilmez ([kanal fiyatı](term:channelprice)).
* Stokta olmayan ürün "stokta yok" olarak işaretlenir.
* Barkod yalnızca 8, 12, 13 veya 14 haneli geçerli bir numaraysa eklenir.
* Ekmek kırıntısı yolu, sayfanın kategori içindeki yerini gösterir (Ana sayfa / Kategori / Ürün).

Anahtarı yalnızca bir sorun gidermek için kapatın. Normalde açık kalmalıdır.

> [!TIP]
> Yapılandırılmış verinin doğru okunup okunmadığını Google'ın "Zengin Sonuçlar Testi" aracıyla sayfa adresini yapıştırarak denetleyebilirsiniz. Google'ın arayüzü değişebilir; güncel araç adı için Google belgelerine bakın.

## Adres yönlendirmeleri

Bir ürünün veya kategorinin [URL adresini (slug)](term:slug) değiştirdiğinizde eski adres ölmez. OpenShelf eski adresi yenisine **otomatik olarak yönlendirir** ([301 yönlendirmesi](term:redirect301)).

**Örnek:** Ürün adresi `/product/eski-vazo` iken `seramik-vazo` olarak değiştirirsiniz. Eski adrese gelen ziyaretçi ve Google, yeni adrese kalıcı olarak yönlendirilir. Daha önce paylaşılmış bağlantılar, e-postalar ve Google'daki sıralamanız korunur.

Yönlendirme tablosunun mantığı:

| Durum | OpenShelf ne yapar |
|---|---|
| Slug'ı bir kez değiştirdiniz | `eski → yeni` yönlendirmesi kaydeder |
| Aynı ürünü ikinci kez değiştirdiniz (`yeni → daha-yeni`) | Eski `eski → yeni` kaydını da `eski → daha-yeni` olarak günceller; zincir oluşmaz |
| Eski adrese geri döndünüz (`daha-yeni → eski`) | Döngüyü önlemek için `eski` kaydını siler |
| `/products/seramik-vazo` gibi eski tarz adres | `/product/seramik-vazo` adresine yönlendirilir |

Yönlendirmeyi siz yönetmezsiniz; ayrı bir tablo ekranı yoktur. Yönlendirme **ürün ve kategori** adresleri için çalışır.

> [!NOTE]
> Bir ürünü silerseniz (satılmamışsa) adresi artık yoktur ve "Sayfa bulunamadı" (404) gösterilir. Satışı yapılmış bir ürün silinmez, "Arşivde" durumuna alınır; böylece sipariş geçmişi bozulmaz. Satışta olmayan ürünü silmek yerine arşivlemeniz önerilir.

Slug kurallarını ve ürün adresi seçimini [Ürün adresi (slug)](/help/catalog#urun-adresi-slug) başlığında bulabilirsiniz.

## Sitemap ve robots

### Site haritası (sitemap.xml)

[Site haritası](term:sitemap), arama motoruna hangi sayfalarınız olduğunu söyleyen otomatik listedir. Adresi: `https://magazaniz.com/sitemap.xml`. Siz bir şey yapmazsınız; OpenShelf güncel tutar. İçeriği:

* Ana sayfa ve tüm ürünler sayfası
* Yayındaki ve "gizli" olmayan kategoriler
* Durumu **Yayında** olan ve "gizli" olmayan ürünler; her ürün için son güncelleme tarihi ve en çok 5 görsel
* 5000 adresi geçerse harita otomatik parçalara bölünür (`sitemap-1.xml`, `sitemap-2.xml`...)

**Taslak** ve **Arşivde** ürünler haritaya girmez. Arama motoru anahtarı kapalıysa harita boş döner. Harita bir önbellekten gelir; bir değişiklik haritada yaklaşık 10 dakika içinde görünür.

### robots.txt

[robots.txt](term:robots), arama motoru robotlarına nereleri gezmemeleri gerektiğini söyler. Adresi: `https://magazaniz.com/robots.txt`. Otomatik üretilir:

| Anahtar durumu | robots.txt ne der |
|---|---|
| Açık | Her yeri gezebilir; ancak `/api/`, `/admin/`, `/mock/`, `/cart`, `/checkout`, `/order/` ve sizin eklediğiniz yollar hariç. Site haritası adresi de yazılır |
| Kapalı | Tüm siteyi gezmeyin |

**Ek robots.txt Disallow yolları** alanıyla robotların gezmesini istemediğiniz özel bölümleri ekleyebilirsiniz (en çok 30 yol). Yol `/` ile başlamalıdır, örneğin `/internal/`. Sepet, ödeme ve sipariş sayfaları her zaman dışarıdadır.

> [!WARNING]
> robots.txt bir güvenlik önlemi değildir; yalnızca düzgün davranan robotlara rica eder. Gizli kalması gereken bir şeyi buraya yazmayın, çünkü liste herkese açıktır.

## Paylaşım önizlemeleri (WhatsApp, Facebook, X)

Bir ürün bağlantısını WhatsApp veya Facebook'ta paylaşınca çıkan kart; sayfadaki başlık, açıklama ve [paylaşım görseli (OG image)](term:ogimage) ile oluşur. Hazırlamak için:

1. **Mağaza ayarları → SEO → Varsayılan paylaşım görseli** alanına 1200 × 630 piksel civarı, 1 MB altında bir görsel yükleyin. Sayfanın kendi görseli yoksa bu kullanılır.
2. İsterseniz **X / Twitter kullanıcı adı** yazın (`@magazaniz`).
3. Önemli ürünlerde ürünün **SEO** bölümünde özel paylaşım görseli seçin.
4. Ürün fotoğraflarına anlamlı [alternatif metin](term:alttext) yazın; bu hem erişilebilirliğe hem görsel aramaya yardımcı olur.

> [!WARNING]
> **Önizleme kartları gerçek bir alan adı ister.** `...workers.dev` gibi geçici adreslerde Facebook ve WhatsApp kartı sorunsuz üretmeyebilir veya eski önizlemeyi önbellekte tutabilir. Yayına aldığınız alan adıyla ([alan adı](term:domain)) bir ürün bağlantısını paylaşarak deneyin. Meta'nın "Paylaşım Hata Ayıklayıcı" aracı eski önizlemeyi yeniletmenize yardım eder; güncel adı için Meta belgelerine bakın.

## Arama motoru araçlarına doğrulama

[Google Search Console](https://search.google.com/search-console) ve Bing Webmaster Tools, sitenizin arama motorunda nasıl göründüğünü ve hangi sorunlar olduğunu gösterir. Kullanmak için sitenin sizin olduğunu kanıtlamanız gerekir.

**Mağaza ayarları → SEO → Site doğrulama** alanında üç kod vardır:

| Alan | Kodu nereden alırsınız | Dikkat |
|---|---|---|
| Google Search Console | Search Console → Ayarlar → Sahiplik doğrulama → HTML etiketi | Etiketin tamamını değil, yalnızca `content="..."` içindeki kodu yapıştırın |
| Bing Webmaster Tools | Siteyi ekle → HTML meta etiketi (`msvalidate.01`) | Yalnızca kod |
| Facebook alan adı doğrulama | Meta Business Suite → Marka güvenliği → Alan adları → meta etiketi yöntemi | Reklam hesabı için alan adı doğrulaması gerekirse |

Adımlar:

1. Search Console'da mülk olarak sitenizin tam adresini ekleyin.
2. Doğrulama yöntemi olarak **HTML etiketi**ni seçin ve `content` kısmındaki kodu kopyalayın.
3. OpenShelf'te kodu ilgili alana yapıştırıp **kaydedin**.
4. Search Console'a dönüp **Doğrula**'ya basın.
5. Doğrulandıktan sonra **Site haritaları** bölümüne `sitemap.xml` yazarak haritayı gönderin.

Mağaza arama motorlarına kapalıyken doğrulama çalışır ama sayfalar listelenmez; indekslemeyi açmayı unutmayın.

## SEO için hızlı kontrol listesi

1. Ana sayfa başlığı ve açıklaması yazıldı.
2. Başlık şablonu uygun (`%s | {storeName}`).
3. En önemli 10 ürünün SEO başlığı ve açıklaması elle yazıldı.
4. Ürün fotoğraflarına alternatif metin eklendi.
5. Varsayılan paylaşım görseli yüklendi.
6. Yapılandırılmış veri açık.
7. Arama motoru anahtarı **açık** (yayında).
8. `/sitemap.xml` ve `/robots.txt` tarayıcıda açılıp kontrol edildi.
9. Search Console doğrulandı ve site haritası gönderildi.
10. Gerçek alan adıyla bir ürün bağlantısı WhatsApp'ta denendi.

## Sık yapılan hatalar

* **Arama motoru anahtarını kapalı bırakmak.** En yaygın ve en pahalı hata (yukarıdaki uyarı).
* **Her ürüne aynı başlığı veya açıklamayı yazmak.** Arama motoru sayfaları ayırt edemez.
* **Çok uzun başlık yazmak.** Şablon da eklendiği için sonu kesilir; marka adı görünmez.
* **Kanonik adresi yanlış girmek.** Ürün listelerden kaybolabilir.
* **Doğrulama kodunun tamamını etiketle yapıştırmak.** Yalnızca `content` içindeki kodu girin.
* **Yeni slug'ı sık sık değiştirmek.** Yönlendirme korur, ama gereksiz değişiklik yapmayın.
* **Taslak ürünün sitede görünmesini beklemek.** Taslak ürünler vitrinde ve haritada yer almaz.
* **Değişikliğin hemen Google'da görünmesini beklemek.** Sayfalar kısa süre önbellekte tutulur ve arama motorları kendi hızında yeniden gezer.

İlgili bölümler: [Mağaza ayarları](/help/store-settings#seo-ayarlari), [Ürünler](/help/catalog#urun-ekleme), [Analitik ve reklam](/help/analytics), [Yayına alma](/help/going-live).
