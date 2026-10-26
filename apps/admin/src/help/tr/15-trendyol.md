# Trendyol konsolu

**Trendyol konsolu**, yönetim panelindeki **Trendyol konsolu** sayfasıdır (sol menüde **Entegrasyonlar** ile **Mağaza ayarları** arasında). [Pazaryeri](term:marketplace) hesabınızla ilgili günlük işleri tek yerden yapmanızı sağlar: ürünlere bakmak ve yeni ürün göndermek, son satışları görmek, iadeleri onaylamak veya reddetmek, müşteri sorularını cevaplamak, hesap ekstresini okumak. Bunların hepsinin altında bir **API gezgini** vardır: Trendyol'un genel pazaryeri API'sindeki 83 işlemin tamamını parametrelerini doldurarak deneyebilirsiniz.

Bu sayfa **yalnızca sahip (owner) ve yönetici (admin) rollerine** açıktır. Sipariş ve iade kayıtları müşterilerin kişisel verisini içerdiği için personel (staff) rolü sayfayı göremez.

> [!NOTE]
> Konsol, mağazanızın kendi Trendyol entegrasyonundan (stok/fiyat gönderimi, sipariş çekme) ayrıdır. Entegrasyonun kurulumu için [Entegrasyonlar](/help/integrations#trendyol) bölümüne bakın; Trendyol siparişlerinin sipariş listenize nasıl düştüğü [Trendyol siparişleri](/help/orders#trendyol-siparisleri) bölümünde anlatılır.

## Bağlantı ve Deneme (mock) modu {#baglanti-ve-mock}

Sayfanın üstündeki renkli çubuk, şu an nereye konuştuğunuzu söyler. Üç durum vardır:

| Çubuk | Anlamı |
|---|---|
| **Simülasyon** (kırmızı) | [Deneme modu (mock)](term:mock) açık. Trendyol'a **hiçbir istek gitmez**; yanıtları sistem çevrimdışı üretir ve gerçek mağazanıza dokunmaz. |
| **Canlı** (yeşil) | Entegrasyon etkin ve anahtarlar girilmiş. İstekler gerçekten Trendyol'a gider. Yanında ortam (**Canlı ortam (Production)** veya **Test ortamı (Stage)**) ve maskelenmiş [Satıcı numaranız](term:sellerid) görünür. |
| **Kapalı** (sarı) | Entegrasyon henüz yapılandırılmamış veya kapatılmış. Düğmeler: **Entegrasyonlar'da yapılandır** ve (yalnızca sahip için) **Mock modunu aç**. İşlem listesine bakabilir, curl komutunu görebilirsiniz ama istek gönderemezsiniz. |

![Trendyol konsolu: simülasyon çubuğu ve Gezgin sekmesi](help/tr/trendyol-explorer.png)

### Mock modunda ne olur?

* Ürünler, siparişler, iadeler ve sorular için gerçekçi **demo veri** görürsünüz. Oluşturduğunuz kayıt sonraki listede görünür; durum değişiklikleri kalıcıdır (örneğin onayladığınız iade onaylı görünür).
* Mock modunda **API anahtarı ve parolası hiç okunmaz**; kayıtlı olsalar bile bu ekranlar onları kullanmaz. Gerçek hesabınıza erişim yoktur.
* Verileri başlangıç haline döndürmek için **Simülasyonu sıfırla** düğmesini kullanın (yalnızca sahip). Sizin oluşturduğunuz demo kayıtlar silinir.
* Mock modunu **Mağaza ayarları → Sistem** sayfasındaki **Deneme (mock) modu** anahtarından açıp kapatırsınız (bkz. [Deneme modu](/help/getting-started#deneme-modu)).

> [!TIP]
> Yeni başlıyorsanız önce Mock modunda her sekmeyi gezin, ürün gönderme sihirbazını ve iade reddetme formunu deneyin. Gerçek anahtarları ancak ne yaptığınızı gördükten sonra girin.

### Gerçek anahtarlarla çalışmak

Canlı çalışma için **Entegrasyonlar → Trendyol → Yapılandır** ekranında [Satıcı numarası](term:sellerid), [API anahtarı](term:apikey) ve [API parolası](term:secret) girilir; Mock modu kapalı olmalıdır. Anahtarlar şifreli saklanır ve sonradan gösterilmez. Konsol her istekte Trendyol'un zorunlu kıldığı `User-Agent: <satıcı numarası> - SelfIntegration` başlığını ve Basic kimlik doğrulamasını sizin yerinize ekler; ikisini de elle yazmanız gerekmez.

## Test ortamı (stage) ve canlı ortam {#stage-ve-canli}

Entegrasyon ekranındaki **Ortam** alanı iki değer alır: **Production** (varsayılan, gerçek hesabınız) ve **Stage (test)**. [Test ortamı](term:stage) ayrı bir Trendyol sunucusudur; orada yaptığınız hiçbir şey gerçek ürünlerinizi, siparişlerinizi veya paranızı etkilemez.

> [!WARNING]
> Test ortamını kullanmak için üç şeyi bilmeniz gerekir. (1) Trendyol, çıkış **IP adresinizi izin listesine** almadan test ortamı yanıt vermez; **503** hatası "IP adresiniz izinli değil" demektir. (2) Test ortamı, canlı ortamdan **farklı API anahtarları** kullanır; canlı anahtarlarınız orada çalışmaz. (3) Test ortamı herkese açık değildir; erişimi ve sunucu adreslerini Trendyol belirler. Güncel koşulları Trendyol'un entegrasyon belgelerinden ve satıcı destekten doğrulayın.

**Canlı** (production) ortamda yazma işlemleri gerçek veriyi değiştirir. Bu yüzden konsol, canlıda her yazma ve geri alınamaz işlemde önce sizden onay ister (bkz. [Riskli işlemler](#riskli-islemler)). Simülasyon ve test ortamında yine de dikkatli olun; ekrandaki çubuğun rengine bakmadan işlem yapmayın.

**Hız sınırı:** Trendyol uç nokta başına **10 saniyede 50 istek** kabul eder; aşarsanız Trendyol "çok fazla istek" (429) döner. Konsol bunu kendiliğinden tekrar denemez; birkaç saniye bekleyip yeniden deneyin. Bazı ürün işlemlerinin ayrıca dakika başına sınırı vardır; işlem sayfasındaki **İstek sınırı** satırı bunu gösterir.

## Ürünler {#urunler}

**Ürünler** sekmesi Trendyol'daki katalogunuzu dört alt sekmede gösterir: **Onaylı**, **Onay bekleyen**, **Arşivlenmiş** ve **Eşleştirmeler**.

![Ürünler sekmesi](help/tr/trendyol-products.png)

**Filtreler** kartında **Barkod**, **Ürün adı**, **Stok kodu** ve **Satış durumu** ile arama yaparsınız; **Değişiklik tarihine göre sınırla** kutusu tarih aralığı ekler (en çok 90 gün). Listede görsel, ürün adı, [barkod](term:barcode), stok, liste fiyatı, satış fiyatı, satış ve onay durumu, marka ve kategori görünür. **Ürün adı** yalnızca ekrandaki sayfada aranır.

Her satırın sağında küçük işlem simgeleri vardır (üzerine gelince adı çıkar):

* **Stok ve fiyatı gönder:** Satırdaki stok ve fiyat alanlarını düzenleyip gönderirsiniz. Yalnızca değiştirdiğiniz değerler gönderilir. Stok 0 ile 20.000 arasında tam sayı olmalı; satış fiyatı liste fiyatını aşamaz.
* **Arşivle / Arşivden çıkar:** Ürünü satıştan kaldırır veya geri getirir.
* **Sil:** Ürünü Trendyol'dan kalıcı olarak siler; Trendyol yalnızca onaysız ürünlerin silinmesine izin verir.
* **Buybox durumu:** Sıranızı ve [buybox](term:buybox) fiyatlarını gösterir.
* **Yerel varyantla eşleştir** ve **ham veri** (JSON) görünümü.

> [!NOTE]
> Stok ve fiyat güncellemeleri **eşzamansızdır**: Trendyol hemen sonuç vermez, bir [toplu istek numarası](term:batchrequest) döner. Sayfanın üstündeki **Toplu işlem sonucu** paneli sonucu 2 saniyede bir kendiliğinden yoklar; sonuçta her kalem için **Başarılı** veya **Başarısız** ve hata nedeni görünür. İsterseniz **Şimdi kontrol et** ile elle de sorabilirsiniz. Trendyol, aynı stok/fiyat isteğinin 15 dakika içinde tekrarını reddeder; uygulama kendi kendine yeniden denemez.

### Eşleştirmeler

**Eşleştirmeler** sekmesi (**Yerel varyant eşleştirmeleri**), bir Trendyol barkodunu mağazanızdaki bir varyanta bağlar. Eşleşen varyantın stoku ve fiyatı Trendyol'a gönderilebilir ve Trendyol listelemesi açılır. **Eşleştirme ekle** ile veya bir ürün satırındaki bağ simgesiyle ekleyebilirsiniz. Eşleştirmeyi silmek Trendyol listelemesini kapatır; Trendyol'daki ürün silinmez.

## Ürün oluşturma sihirbazı {#urun-olusturma-sihirbazi}

**Trendyol'a ürün ekle** düğmesi dört adımlı bir sihirbaz açar:

1. **Yerel ürün:** Mağazanızdan bir varyant seçin (ad, stok kodu veya barkodla arayın). Adı, açıklaması, görselleri, fiyatı ve stoku varsayılan değer olur.
2. **Trendyol alanları:** Marka (en az 2 harf yazınca aranır), yalnızca en alt seviyedeki kategori, başlık (en çok 100 karakter), barkod (en çok 40 karakter), stok kodu, model kodu, KDV oranı (0, 1, 10 veya 20), stok, liste ve satış fiyatı, kargo firması, desi, açıklama ve en çok 8 görsel. Kategoriyi seçince **Kategori özellikleri** belirir; zorunlu olanlar yıldızlıdır.
3. **Önizleme:** Trendyol'a gidecek **İstek gövdesi (JSON)** gösterilir. Göndermeden önce düzenleyebilir, **Formdan yeniden oluştur** ile başa dönebilirsiniz. Katalog kurallarına göre bulunan sorunlar listelenir.
4. **Gönder:** **Trendyol'a gönder** isteği yollar. Sonuç eşzamansızdır; ürün, Trendyol onaylayana kadar **Onay bekleyen** sekmesinde durur ve ret nedeni toplu işlem sonucunda görünür.

![Ürün oluşturma sihirbazı](help/tr/trendyol-wizard.png)

> [!WARNING]
> Görsel adreslerinin herkese açık `https://` adresi olması gerekir. `localhost` gibi adresleri Trendyol indiremez ve ürün reddedilir. Trendyol'un kategori ve özellik kuralları Trendyol'a aittir; konsolun denetimi yalnızca yardımcıdır, asıl doğrulamayı Trendyol yapar.

## Son satışlar {#son-satislar}

**Son satışlar** sekmesi [sipariş paketlerini](term:shipmentpackage) listeler. Trendyol bu liste için en çok **2 haftalık** bir aralığa izin verir; aralık aşılırsa istek gönderilmez ve uyarı çıkar. Hızlı seçimler: **Bugün**, **Son 3 gün**, **Son 7 gün**, **Son 14 gün**. **Durum** ile (seçmezseniz hepsi) ve **Sipariş numarası** ile süzebilirsiniz. **Özet** kartları (**Paket sayısı**, **Brüt ciro**, durum dağılımı, en çok satan ürünler) yalnızca ekrandaki sayfadan hesaplanır.

![Son satışlar ve sipariş çekmecesi](help/tr/trendyol-orders.png)

Bir satırı açınca sağdan çekmece gelir:

* **Müşteri ve adresler:** Müşterinin adı, e-postası, telefonu ve adresleri. Bu bölüm **kişisel veri** içerir; yalnızca siparişi yerine getirmek için kullanın.
* Kalemler, paket toplamı, kargo firması, **Takip no**, **Desi** ve **Koli sayısı**, **Paket geçmişi**.
* **İşlemler → Durum akışı:** Yalnızca **Hazırlanıyor yap** ve **Faturalandı yap** Trendyol'a bildirilir; gönderim ve teslimat sonraki durumlara kendiliğinden geçer. Önce paketi hazırlanıyor yapın, sonra **Fatura numarası** yazıp faturalandı yapın.
* **Fatura linki gönder:** e-Fatura/e-Arşiv PDF'sinin `https` bağlantısı (8 yıl erişilebilir kalmalı).
* **Kargo takip bilgisi (kendi kargonuz):** Trendyol'un kargosu yerine kendi kargonuzla gönderiyorsanız takip bağlantısını veya telefonu bildirirsiniz.
* **Koli bilgisi ve kargo etiketi:** **Desi/koli kaydet**, **Etiket oluştur**, **Etiketi göster**. [Ortak etiket](term:commonlabel) paket hazırlanıyor veya faturalandı olduktan sonra oluşur.
* **Kalemi iptal et:** Kalem, adet ve nedeni (ör. stokta yok, hatalı fiyat) seçilir. Bu işlem **geri alınamaz**; müşteri ürünü almaz ve Trendyol tutarı iade eder. Tüm kalemleri iptal etmek paketi iptal eder.

## İadeler {#iadeler}

**İadeler** sekmesi müşterilerin açtığı [iade taleplerini](term:claim) listeler. **İade durumu** ile süzer, isterseniz **Tarih aralığına göre sınırla** ile aralık verirsiniz. Satırı açınca müşterinin nedeni, notu, gönderdiği görseller, iade edilen kalemler ve her kalemin **Geçmiş** kaydı görünür.

![İadeler sekmesi](help/tr/trendyol-returns.png)

* **Onayla:** Kalem onaylanır ve müşteriye para iade edilir. Bu işlem geri alınamaz; onay penceresi kalem sayısını söyler. **Bekleyenlerin tümünü onayla** toplu onay yapar.
* **Reddet:** **İadeyi reddet** formu açılır. **Reddetme nedeni** (Trendyol'un tanımladığı nedenlerden biri) ve en çok 500 karakterlik bir **Açıklama** zorunludur. **Kanıt dosyası** (fotoğraf, PDF veya video, en çok 5 MB) bazı nedenler için Trendyol'ca zorunludur; konsol, dosya zorunlu olmayan nedenlerde de reddetme taleplerini her zaman bir ekle gönderir. **Reddetme talebi gönder** ile talep Trendyol'a incelenmek üzere gider ve kalem **İnceleniyor** olur. Trendyol kabul ederse ürün satıcıya iade edilmez ve para müşteride kalır; reddederse iade devam eder.

> [!WARNING]
> Trendyol, müdahale edilmeyen iadeleri 48 saat sonra kendiliğinden kabul eder; **Aksiyon bekliyor** durumundaki talepleri zamanında kontrol edin. Reddetme talebi, onay değildir: karar Trendyol'dadır.

## Sorular {#sorular}

**Sorular** sekmesi ürün sayfalarına gelen müşteri sorularını gösterir. **Soru durumu** ile süzersiniz; cevap bekleyenler üstte durur. Cevaplanmayan soru 3 iş günü içinde kapanır.

![Sorular sekmesi](help/tr/trendyol-questions.png)

Bir soruda **Cevapla**'ya basıp **Cevabınız** alanını doldurur ve **Cevabı gönder** dersiniz. Cevap en az ve en çok belirli bir uzunlukta olmalıdır (alanın altında yazar). **Hızlı cevap şablonları** kartındaki bir şablonu seçip göndermeden önce düzenleyebilirsiniz; şablonları **Şablonları düzenle** ve **Şablonları kaydet** ile değiştirirsiniz. Şablonlar yalnızca bu tarayıcıda saklanır.

> [!WARNING]
> Gönderilen cevap sonradan değiştirilemez ve ürün sayfasında herkese görünür. Yasaklı sözcük içeren cevapları Trendyol reddeder.

## Finans {#finans}

**Finans** sekmesi üç alt sekmeden oluşur: **Hesap ekstresi** ([settlement](term:settlement)), **Diğer finansal** (stopaj, havale, ödeme emri vb.) ve **Kargo faturası**.

![Finans sekmesi](help/tr/trendyol-finance.png)

**Hesap ekstresi**nde **İşlem türü** seçilir (satış, iade, indirim, kupon, komisyon, satıcıya kalan ve iptalleri); her sorgu tek bir tür döndürür. Satış ve [komisyon](term:commission) kayıtları çiftler halinde okunmalıdır. Tarih aralığı en çok 15 gündür; **Sayfa boyutu** 500 veya 1000'dir. Üstteki **Satışlar (alacak)**, **İadeler (borç)**, **Komisyon** ve **Satıcıya kalan** toplamları yalnızca yüklenen satırlardan hesaplanır. **Kargo faturası** için **Fatura seri numarası** gerekir; bilmiyorsanız **Faturaları bul** ile seçilen aralıktaki kargo faturalarını listelersiniz.

**CSV indir** düğmesi tabloyu UTF-8 CSV olarak indirir; dosyada yalnızca **ekrandaki sayfanın** satırları bulunur. Daha fazla kayıt için sayfalar arasında gezip tekrar indirin.

> [!NOTE]
> Finansal kayıtlar sipariş **teslim edildikten sonra** oluşur; ödeme emri normalde her Çarşamba açılır. Yeni bir satışı hesap ekstresinde hemen görememeniz normaldir.

## API gezgini {#api-gezgini}

**Gezgin** sekmesi, Trendyol'un genel pazaryeri API'sindeki **83 işlemin** tamamını içerir (belge sürümü v2.0, Türkiye; kapatılan eski ürün API'leri yoktur). Soldaki ağaçta işlemler gruplara ayrılmıştır: **Markalar**, **Kategoriler**, **Ürün işlemleri**, **Fiyat ve stok güncelleme**, **Ürün listeleme**, **Toplu istek sonuçları**, **Tanımlar**, **Sipariş paketleri**, **Paket bölme**, **Kargo**, **Adresler**, **İade talepleri**, **Müşteri soruları**, **Faturalar**, **Satıcı bilgileri**, **Etiketler**, **Webhook**, **Finans**, **Kargo faturaları**, **Hızlı teslimat**, **Test siparişleri**, **Garanti** ve **Ürün videoları**. **İşlem ara** kutusu ad, işlem kimliği (`getShipmentPackages`), adres veya yönteme göre arar; birden çok sözcük yazarsanız hepsi eşleşmelidir.

Bir işlem seçince sağda adı, yöntemi, tam adresi, resmî belge bağlantısı ve **İstek sınırı** görünür. Üç sekme vardır: **Parametreler** (zorunlu alanlar işaretlidir, tarih alanlarında hızlı aralık düğmeleri bulunur), **İstek gövdesi** (**Örnek yükle**, **Alan rehberi**, JSON doğrulaması; en çok 2 MB) ve **İstek önizleme** (anahtarsız **curl komutu**). Yanıt **Tablo**, **Ağaç** ve **Ham** görünümlerinde okunur; **Başlıklar** ve **İstek** de ayrı sekmelerdedir. Yanıtlar 2 MB'ta kesilir.

Her işlem bir **risk düzeyi** taşır:

| Düzey | Anlamı |
|---|---|
| **Okuma** | Veri değiştirmez, güvenle denenir (36 işlem). |
| **Yazma** | Trendyol'da veriyi değiştirir: ürün, stok, fiyat, sipariş durumu (38 işlem). |
| **Geri alınamaz** | Silme veya iptal gibi, geri getirilemeyen işlemler (9 işlem). |

## Riskli işlemler {#riskli-islemler}

Simülasyon modunda hiçbir istek Trendyol'a gitmediği için onay sorulmaz. **Canlıda** ise bir **Yazma** veya **Geri alınamaz** işlem gönderirken konsol **Canlı işlemi onaylayın** penceresini açar: işlem, istek, risk ve ortam (canlı ortamda kırmızı **CANLI ORTAM** uyarısı) özetlenir. **Onayla ve gönder** (geri alınamazda **Evet, geri alınamaz işlemi gönder**) dedikten sonra istek, sunucuya işlem kimliğini içeren bir `confirm` değeriyle gider. Bu değer olmadan sunucu canlı yazmayı reddeder ("onay gerekli" hatası), yani arayüzü atlayan bir çağrı bile yanlışlıkla veri değiştiremez.

> [!DANGER]
> Canlı ortamda **Geri alınamaz** bir işlemi gönderirseniz silinen veya iptal edilen kaydı geri getiremezsiniz. Önce **Okuma** işlemleriyle durumu görün, mümkünse test ortamında deneyin ve ancak sonra canlıda gönderin.

Her canlı çağrı **Denetim kaydı**na da işlenir: işlem kimliği, risk, ortam ve durum yazılır; istek ve yanıt gövdeleri yazılmaz.

## Çağrı geçmişi {#cagri-gecmisi}

Gezgin sekmesindeki **Geçmiş** düğmesi **Son istekler** panelini açar. Son **30 günde** gönderilen istekler (işlem, yöntem, ortam, simülasyon/canlı, risk, durum, süre ve kim gönderdiği) listelenir. Birine tıklamak işlemi ve parametrelerini geri yükler; aynı isteği yeniden denemek kolaylaşır.

Geçmişte yalnızca **özet** tutulur. Müşteri **kişisel verisi (ad, adres, telefon, e-posta) saklanmaz**; API anahtarları ve parolalar hiçbir yerde saklanmaz veya gösterilmez. Sahip, **Geçmişi temizle** ile kayıtları silebilir; bu **Denetim kaydı**nı etkilemez.

## Sık hatalar {#sik-hatalar}

| Gördüğünüz | Anlamı ve ne yapmalı |
|---|---|
| Sayfada **Kapalı** çubuğu | Entegrasyon kapalı veya anahtar girilmemiş. **Entegrasyonlar'da yapılandır**'a gidin veya **Mock modunu aç**. |
| **503** (test ortamı) | Çıkış IP adresiniz Trendyol'da izin listesinde değil. Trendyol'a IP'nizi tanıttırın. |
| **401** veya **403** | Anahtar/parola yanlış, ya da canlı anahtarı test ortamında (veya tersi) kullanıyorsunuz. Test ortamı ayrı anahtar ister. |
| **429**, "çok fazla istek" | Uç nokta başına 10 saniyede 50 isteği aştınız. Birkaç saniye bekleyip yeniden deneyin. |
| "Onay gerekli" | Canlı yazma işlemi onaysız gönderildi. Onay penceresinde onaylayıp yeniden deneyin. |
| Aralık çok geniş | Siparişlerde 2 hafta, ürünlerde 90 gün, finansta 15 gün sınırı vardır. Tarihleri daraltın. |
| Aynı stok/fiyat isteği reddedildi | Trendyol aynı isteğin 15 dakika içinde tekrarını reddeder. Yalnızca değişen değerleri gönderin ve bekleyin. |
| Ürün **Onay bekleyen**de kaldı | Trendyol henüz onaylamadı veya reddetti; nedeni **Toplu işlem sonucu**nda okuyun. |

> [!WARNING]
> **Doğrulanmamış noktalar.** Bu konsol Trendyol'un yayımlanmış belgelerine göre hazırlandı, ancak gerçek bir satıcı hesabıyla uçtan uca denenmedi: alan adları, sınırlar ve durum sözlüğü Trendyol tarafında değişebilir. Canlıya geçmeden önce küçük bir deneme yapın ve Trendyol'un güncel belgelerini kontrol edin. Test ortamının erişim koşulları ve süreleri Trendyol'a aittir. Konsol, mevzuata (KVKK, e-ticaret, vergi) uyum garantisi vermez; kişisel veriyi yalnızca siparişi yerine getirmek için kullanmak sizin sorumluluğunuzdadır. Trendyol Express veya Trendyol'a özel kargo davranışı varsayılmaz. Ücret ve kotalar için de Trendyol'un güncel koşullarına bakın.
