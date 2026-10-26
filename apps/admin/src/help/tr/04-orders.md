# Siparişler

Bu bölümde bir siparişin yaşam döngüsünü baştan sona öğrenirsiniz: sipariş durumları ve her geçişin stok, para ve müşteri bildirimleri üzerindeki etkisi, sipariş ayrıntı sayfası, ödemenin nasıl doğrulandığı, tam ve kısmi iade, kargo oluşturma, müşteriye giden bildirimler, etiket/paket fişi yazdırma ve Trendyol'dan gelen siparişler. Örneklerde **DEMO-1004** numaralı bir siparişi (1 adet **Seramik Vazo**, `VAZO-S-KREM`, 349,90 ₺) izleyeceğiz.

Sol menüden **Siparişler**'e tıklayın. Liste en yeni sipariş en üstte olacak şekilde gelir.

![Sipariş listesi](help/tr/orders-list.png)

| Öğe | Ne yapar |
|---|---|
| **Ara** | Sipariş numarası veya müşteri e-postasıyla arar (`DEMO-1004`, `ayse@…`). |
| **Durum** filtresi | Yalnızca seçilen durumdaki siparişleri gösterir. |
| **Kaynak** filtresi | **Web sitesi** veya **Trendyol** siparişlerini ayırır. |
| Satır kutuları | Birden çok sipariş seçin; altta çıkan çubuktan **Etiket yazdır (N)**, **Paket fişleri (N)** veya **Faturalar (N)** (fatura kopyası) toplu yazdırın. |
| **DENEME** rozeti | Deneme modunda (sahte ödeme) oluşmuş sipariş. Bkz. [Deneme modu](/help/getting-started#deneme-modu). |

**Genel bakış** ekranındaki "Duruma göre siparişler" çubuğundaki bir duruma tıklarsanız bu listeye o filtre uygulanmış olarak gelirsiniz.

## Sipariş durumları

Her sipariş, sekiz durumdan birindedir ve yalnızca izin verilen geçişler yapılabilir. Sistem geçersiz bir geçişe izin vermez ("Geçersiz durum geçişi" uyarısı verir).

```
Beklemede → Ödeme bekleniyor → Ödendi → Hazırlanıyor → Kargoya verildi → Teslim edildi
     └────────────┴───────────→ İptal edildi        (Ödendi / Hazırlanıyor'dan da iptal edilebilir)
       Ödendi · Hazırlanıyor · Kargoya verildi · Teslim edildi ───→ İade edildi
```

| Durum | Anlamı | Kim/ne ayarlar | Sonraki olası durumlar |
|---|---|---|---|
| **Beklemede** | Sipariş kaydı açıldı, henüz ödemeye geçilmedi. | Sistem | Ödeme bekleniyor, İptal edildi |
| **Ödeme bekleniyor** | Müşteri ödeme sayfasına yönlendirildi; stok ayrıldı ([rezervasyon](term:reservation)). | Sistem | Ödendi, İptal edildi |
| **Ödendi** | Ödeme doğrulandı. Stok kalıcı düşüldü. | **Yalnızca ödeme akışı** | Hazırlanıyor, İade edildi, İptal edildi |
| **Hazırlanıyor** | Siparişi hazırlıyorsunuz. Kargo oluşturunca otomatik bu duruma geçer. | Siz / kargo oluşturma | Kargoya verildi, İade edildi, İptal edildi |
| **Kargoya verildi** | Paket kargo firmasına teslim edildi. | Siz | Teslim edildi, İade edildi |
| **Teslim edildi** | Müşteri teslim aldı. | Siz | İade edildi |
| **İptal edildi** | Sipariş iptal. Son durumdur. | Siz / rezervasyon süresi dolunca sistem | (yok) |
| **İade edildi** | Ödemenin tamamı müşteriye iade edildi. Son durumdur. | **Yalnızca iade akışı** | (yok) |

> [!NOTE]
> **Ödendi** ve **İade edildi** durumlarını elle seçemezsiniz; bunlar ödeme ve iade işlemlerinin sonucudur ("Bu durum ödeme/iade akışıyla belirlenir"). Böylece para hareketi olmadan sipariş "ödenmiş" gösterilemez.

### Her geçişte ne olur?

| Geçiş | Stok | Müşteriye bildirim | Diğer |
|---|---|---|---|
| Ödeme bekleniyor → **Ödendi** (otomatik) | Ayrılan adet kalıcı düşülür | **Sipariş ödendi** (ayar açıksa) + size **Yeni sipariş** | e-Faturam açıksa fatura kesme işi sıraya girer; Meta/GA4 açıksa satın alma olayı gider |
| Ödendi → **Hazırlanıyor** (kargo oluşturunca otomatik) | Değişmez | Yok | |
| Hazırlanıyor → **Kargoya verildi** | Değişmez | **Sipariş kargolandı** (takip no ile) | |
| Kargoya verildi → **Teslim edildi** | Değişmez | **Sipariş teslim edildi** | |
| Beklemede / Ödeme bekleniyor → **İptal edildi** | Ayrılan adet serbest kalır, kupon hakkı iade edilir | **Yok** (sessiz iptal) | |
| Ödendi / Hazırlanıyor → **İptal edildi** | Adetler stoğa **geri eklenir** | **Sipariş iptal edildi** | **Para otomatik iade edilmez.** Müşteriye parayı iade etmek için ayrıca **İade** yapın. |
| Herhangi bir ödenmiş durum → **İade edildi** (tam iade) | **Değişmez** (otomatik artmaz) | **Sipariş iade edildi** | Ürün size döndüyse stoğu elle artırın |

> [!WARNING]
> Ödenmiş bir siparişi **İptal edildi** yapmak parayı iade etmez, yalnızca stoğu geri koyar. Müşteri parasını almak için sipariş sayfasında ayrıca **İade** yapın. Önce iade yapmak (tam iade) siparişi zaten **İade edildi** durumuna alır.

### Durumu değiştirme (adım adım)

1. Sipariş ayrıntı sayfasını açın.
2. Sağdaki **Durum** kartında, yalnızca izin verilen sonraki durumlar düğme olarak görünür.
3. İlgili düğmeye tıklayın (örnek: **Kargoya verildi**).
4. Onay penceresinde "Sipariş «Kargoya verildi» durumuna alınsın mı?" sorusunu onaylayın. İptal düğmesi kırmızıdır.

Durum kartında düğme yoksa "Bu sipariş son durumda; artık değiştirilemez." yazar.

### Rezervasyon süresi ve otomatik iptal

Müşteri ödemeye geçtiğinde stok, **Mağaza ayarları → Ödeme ve sipariş → Stok rezervasyonu (dakika)** kadar ayrılır (varsayılan 15). Süre dolup ödeme gelmediyse sistem (her dakika çalışan bir kontrolle) siparişi kendiliğinden **İptal edildi** yapar, stoğu serbest bırakır. Siz bir şey yapmazsınız.

### Sık yapılan hatalar

- **Kargoya vermeden "Kargoya verildi" yapmak:** Müşteriye takip numarasız bildirim gider. Önce kargoyu oluşturun.
- **"İptal edildi" yapıp parayı iade etmeyi unutmak:** Müşterinin parası hesabında kalır.
- **Teslim edildi'yi erken işaretmek:** Geri alınamaz; sonraki tek yol iadedir.
- **Mock siparişleri gerçek sanmak:** **DENEME** rozetine dikkat edin.

## Sipariş detayı

![Sipariş detay sayfası](help/tr/order-detail.png)

Listeden bir siparişe tıklayınca ayrıntı sayfası açılır. Başlıkta sipariş numarası (**Sipariş #DEMO-1004**), tarih, müşteri adı ve e-postası bulunur.

### Üstteki işlem düğmeleri

| Düğme | Ne yapar | Kim kullanabilir |
|---|---|---|
| **İade et** | **Siparişi iade et** penceresini açar. Yalnızca ödenmiş durumlarda görünür (Ödendi, Hazırlanıyor, Kargoya verildi, Teslim edildi). | Yönetici ve mağaza sahibi |
| **Kargo oluştur** | Geliver üzerinden kargo gönderisi ve etiket oluşturur. | Herkes |
| **Fatura kes** | e-Faturam ile siparişin faturasını kesme işini sıraya alar (otomatik fatura kapalıysa elle). | Herkes |
| **Bu siparişten fatura oluştur** | Siparişin bilgileriyle **Faturalar** sayfasında hazır bir taslak açar; fiyat ve satırları düzenleyebilirsiniz. Bkz. [Manuel fatura](/help/invoices#manuel-fatura). | Taslak yazma: yönetici ve sahip |
| **Müşteriye e-posta gönder** | Alıcı ve konu dolu olarak e-posta yazma ekranını açar. Bkz. [E-posta yazma](/help/email#e-posta-yazma). | Gönderme: yönetici ve sahip |
| **Yazdır** | Açılır menü: **Kargo etiketi**, **Paket fişi**, **Fatura kopyası**, **Sipariş özeti**. | Herkes |

### Kartlar

| Kart | İçerik |
|---|---|
| **Ürünler** | Satırlar: ürün adı, SKU, adet, birim fiyat, satır toplamı ve en altta **Toplam**. |
| **Ödemeler** | Sağlayıcı (iyzico), durum (Bekliyor / Başarılı / Başarısız / İade edildi), tutar, tarih. Deneme modundaysa **DENEME** rozeti. |
| **Kargolar** | Kargo firması, takip numarası, durum, etiket bağlantısı. |
| **Bildirimler** | Bu sipariş için gönderilen e-posta/SMS kayıtları. Bkz. [Sipariş bildirimleri](/help/orders#siparis-bildirimleri). |
| **Faturalar** | Tür (e-Fatura / e-Arşiv), numara, durum, belge bağlantısı. |
| **Durum** | Geçerli durum ve izin verilen sonraki durum düğmeleri. Sipariş kaynağı (Web sitesi / Trendyol) yazar. |
| **Geçmiş** | Siparişte olan her şeyin kronolojik listesi: ödeme olayları, durum değişiklikleri, iadeler, kargo ve fatura olayları. Neyin ne zaman, kimin eliyle yapıldığını buradan izlersiniz. |

> [!TIP]
> Müşteri "siparişim ne durumda?" diye sorduğunda önce **Geçmiş**'ne ve **Bildirimler** kartına bakın: ödeme geldi mi, kargo oluşturuldu mu, müşteriye mesaj gitti mi, hepsi orada.

## Ödeme doğrulama

Müşteri kart bilgilerini sizin sitenizde değil, ödeme kuruluşunun (iyzico) **barındırılan ödeme sayfasında** ([hosted checkout](term:hostedcheckout)) girer. Kart verisi OpenShelf'e ve sunucunuza hiç ulaşmaz. Ödeme bitince iki ayrı yoldan sonuç size ulaşır:

1. **Tarayıcı dönüşü (callback):** Müşteri ödeme sonrası sitenize döner. Sistem, tarayıcının söylediğine güvenmez: ödeme kuruluşuna **sunucudan sunucuya** sorarak ödemeyi yeniden sorgular.
2. **Bildirim (webhook):** İyzico, ödeme sonucunu ayrıca [webhook](term:webhook) ile bildirir. Webhook'un imzası doğrulanır; sahte bildirimler reddedilir.

Sipariş, ancak şu kontroller geçildikten sonra **Ödendi** olur:

- Ödemenin **tutarı ve para birimi**, siparişteki beklenen tutarla birebir aynıdır.
- İmza/sorgu doğrulaması başarılıdır.
- Aynı bildirim ikinci kez gelirse yok sayılır (aynı ödeme iki kez işlenmez).

### Beklenmedik durumlar

| Durum | Ne olur | Siz ne yaparsınız |
|---|---|---|
| **Tutar uyuşmazlığı** | Sipariş **Ödendi** olmaz; hata **Entegrasyon olayları** ekranına yazılır ("tutar/para birimi uyuşmazlığı"). | iyzico panelinde ödemeyi inceleyin; gerekirse müşteriyle iletişime geçin. |
| **Taksit komisyonu farkı** | iyzico, taksitli ödemelerde ödenen tutarı artırabilir. İyzico kartındaki **Taksit komisyonuna izin ver** kapalıysa ödeme reddedilir. | Taksit sunuyorsanız bu seçeneği bilerek açın; komisyonun kime ait olduğunu iyzico sözleşmenizden doğrulayın. |
| **Geç ödeme** | Müşteri ödemeyi, rezervasyon süresi dolup sipariş **İptal edildi** olduktan sonra tamamlar. Sipariş yeniden açılmaz; olay "elle iade gerekir" uyarısıyla **Entegrasyon olayları**'na yazılır. | Ödemeyi iyzico panelinden veya sipariş sayfasından iade edin ve müşteriyi bilgilendirin. |
| **Ödeme başarısız** | Ödeme "Başarısız" olur; sipariş **Ödeme bekleniyor**'da kalır, süre dolunca iptal olur. | Gerekmez; müşteri tekrar deneyebilir. |

> [!NOTE]
> Rezervasyon süresini çok kısa tutmak "geç ödeme" olasılığını artırır. 15–30 dakika makul bir aralıktır.

Ödeme sorunları için [Sorun giderme](/help/troubleshooting#odeme-sorunlari) bölümüne bakın.

## İade

İade, müşteriye parayı geri vermek demektir. **Yönetici** ve **mağaza sahibi** yapabilir; personel yapamaz.

### Tam veya kısmi iade (adım adım)

1. Ödenmiş sipariş sayfasını açın (**Ödendi**, **Hazırlanıyor**, **Kargoya verildi** veya **Teslim edildi** durumunda).
2. Üstteki **İade et** düğmesine tıklayın.
3. Açılan pencerede **Tutar (TRY)** alanına iade edilecek tutarı yazın (alanın altında "Sipariş toplamı 349,90 ₺" ipucu görünür). Tam iade için siparişin tamamını yazın.
4. **Neden** alanına kısa bir gerekçe yazın ("Müşteri vazgeçti", "Hasarlı geldi"). Tutar ve neden dolu olmadan düğme çalışmaz.
5. Pencerenin altındaki kırmızı **İade et** düğmesine basın.

### Arka planda ne olur?

1. Sistem, daha önce iade edilen tutarlarla birlikte toplamın **ödenen tutarı aşmadığını** kontrol eder ("İade tutarı ödenen tutarı aşıyor" hatası). Bu kontrol aynı anda yapılan iki iade isteğinde bile güvenlidir.
2. Ödeme kuruluşuna (iyzico) iade isteği gönderilir. Sağlayıcı reddederse ("Sağlayıcı iadeyi reddetti") kayıt **başarısız** olarak saklanır, siparişiniz değişmez ve toplam iade hesabına dahil edilmez.
3. Başarılı olursa iade kaydı oluşur ve **Denetim kaydı**'na yazılır.
4. **Kısmi iade** ise sipariş durumu değişmez (ödenmiş durumda kalır); aynı siparişe daha sonra tekrar iade yapabilirsiniz.
5. **Tam iade** (başarılı iadelerin toplamı ödenen tutara ulaştığında): ödeme **İade edildi** olur, sipariş **İade edildi** durumuna geçer ve müşteriye **Sipariş iade edildi** bildirimi gider (ayar açıksa). Ayrıntı için [iade](term:refund) tanımına bakın.

> [!DANGER]
> İade, ödeme kuruluşuna gerçek bir para iade talimatıdır ve **geri alınamaz**. Tutarı göndermeden önce iki kez kontrol edin. İadenin müşterinin kartına yansıma süresi bankaya ve iyzico'ya bağlıdır; bu süre OpenShelf tarafından kontrol edilmez.

### Mock/gerçek uyuşmazlığı (`mock_mismatch` kuralı)

Sistem, ödemenin gerçek mi sahte mi olduğunu kaydeder. Güvenlik için:

- **Deneme modunda (sahte) yapılmış ödeme**, deneme modu **kapalıyken** iade edilemez: "Bu ödeme MOCK modunda yapıldı (gerçek para hareketi olmadı); mock modu kapalıyken iade edilemez. İade için mock modunu açın."
- **Gerçek ödeme**, deneme modu **açıkken** iade edilemez: "Bu GERÇEK bir ödeme; mock modu açıkken iade edilemez. Önce mock modunu kapatın." (Aksi halde sahte adaptör iade etmiş gibi davranırdı.)

Bu kural, para hareketi olmadan "iade edildi" kaydı oluşmasını engeller.

### İade ile ilgili diğer notlar

- **Faturayı iptal etmek ayrı bir işlemdir.** İade, kesilmiş faturayı otomatik iptal etmez; [Fatura iptali](/help/invoices#fatura-iptali) bölümüne bakın ve mali müşavirinize danışın.
- **Stok otomatik artmaz.** Ürün size döndüyse **Ürünler** ekranından stoğu elle düzeltin ([Stok](/help/catalog#stok-ve-stok-defteri)).
- **Trendyol siparişleri** OpenShelf'ten iade edilemez; ödemeyi Trendyol yönetir ("İade edilecek başarılı ödeme yok" hatası).
- Sipariş yalnızca ödeme sağlayıcısının iade desteği varsa iade edilebilir.

## Kargo

Siparişi paketledikten sonra sipariş sayfasından kargo gönderisi oluşturursunuz. Bunun için **Geliver** entegrasyonunun açık ve ayarlı olması gerekir (bkz. [Geliver](/help/integrations#geliver)). Kargo oluşturmak için sipariş **Ödendi** veya **Hazırlanıyor** durumunda olmalıdır ("Kargolamadan önce sipariş ödenmiş olmalı").

### Kargo oluşturma (adım adım)

1. Sipariş sayfasında **Kargo oluştur**'a tıklayın.
2. **Kargo hizmet kimliği** alanına, Geliver'ın size sunduğu teklifteki hizmet kimliğini yazın (ipucu: "Kargo entegrasyonunuzdan (Geliver) gelen hizmet/teklif kimliği"). Bu sürümde teklif listesi bu pencerede gösterilmez; kodu Geliver panelinizden veya Geliver dokümanındaki fiyat listesinden almanız gerekir.
3. **Oluştur**'a basın.
4. Sistem Geliver'dan gönderiyi ve etiketi alır; **Kargolar** kartında kargo firması, takip numarası ve etiket bağlantısı belirir. Sipariş **Ödendi** ise otomatik **Hazırlanıyor**'a geçer.
5. Etiketi yazdırıp paketi kargo firmasına teslim edin (bkz. [Yazdırma](/help/orders#yazdirma)).
6. Kargo firması aldıktan sonra sipariş durumunu **Kargoya verildi** yapın; müşteri takip numarasıyla bilgilendirilir.
7. Teslimat gerçekleşince **Teslim edildi**'ye geçin.

### Kargoyu Geliver dışında yaptıysanız

Gönderiyi başka bir yoldan (örneğin kargo şubesinden) yaptıysanız **Kargo oluştur** kullanmak zorunda değilsiniz. Ancak **Ödendi** durumundaki bir sipariş doğrudan **Kargoya verildi**'ye geçemez: önce **Hazırlanıyor**'a, sonra **Kargoya verildi**'ye alın. Bu durumda sistemde takip numarası olmadığından müşteri bildirimine takip numarası eklenemez; takip numarasını **Müşteriye e-posta gönder** ile elle iletebilirsiniz.

### Paket ağırlığı ve ölçüleri

Sistem, gönderi için her ürünün ağırlığını kullanır. Ürün formunda ağırlık alanı bulunmadığından ağırlığı tanımlı olmayan ürünler için **adet başına 500 gram** varsayılır; boyutlar varsayılan olarak 10×10×10 cm kabul edilir. Gerçek ağırlıklarınız farklıysa kargo ücreti beklediğinizden farklı çıkabilir. Geliver çekmecesindeki **Test modu**'nun canlıda **kapalı** olduğundan emin olun (aksi halde ücretsiz test gönderileri oluşur ve paketler gerçek bir kargoya iletilmez).

> [!WARNING]
> Etiket ücretini kargo firması/Geliver keser; deneme gönderisi oluşturmak için Geliver'ın **Test modu** ayarını kullanın ve gerçek paketler için kapatın. Mock modunda ise hiçbir gerçek gönderi oluşmaz.

### Sık yapılan hatalar (kargo)

- **"Kargo sağlayıcısı yok" hatası:** Geliver entegrasyonu açık değil. **Entegrasyonlar**'dan açıp bağlantıyı test edin.
- **Geliver'da gönderici adres kimliği boş:** Gönderi oluşmaz. Bkz. [Geliver](/help/integrations#geliver).
- **Eksik/yanlış alıcı telefonu veya adresi:** Etiket reddedilir; müşteri adresini siparişte kontrol edin.
- **Hizmet kimliğini yanlış yazmak:** Geliver hatası döner; teklif listesinden doğru kodu alın.

## Sipariş bildirimleri

Sipariş durumu değiştikçe müşteriye e-posta ve/veya SMS gider. Hangi olayda hangi kanalın çalışacağı **Mağaza ayarları → Bildirimler**'den belirlenir ([ayrıntılı anlatım](/help/store-settings#bildirimler)). Bu bölüm, bir siparişte ne gönderildiğini nasıl izleyeceğinizi anlatır.

Sipariş sayfasındaki **Bildirimler** kartı her gönderim denemesini listeler:

| Sütun | Anlamı |
|---|---|
| **Olay** | Hangi olay (sipariş ödendi, kargolandı…) |
| **Kanal** | SMS veya e-posta |
| **Alıcı** | Kısmen gizlenmiş e-posta adresi veya telefon |
| **Durum** | **Gönderildi**, **Başarısız**, **Atlandı** veya **Sırada** |
| **Zaman** | Ne zaman |

**Atlandı** durumunun nedeni kartta yazar. En yaygın nedenler:

| Neden | Ne demek | Çözüm |
|---|---|---|
| Sağlayıcı yok | Kanalın sağlayıcısı (Netgsm/Twilio/Cloudflare E-posta) **Entegrasyonlar**'da açık değil. | Sağlayıcıyı açın. |
| Alıcı yok / geçersiz alıcı | Sipariş formunda e-posta veya telefon eksik ya da hatalı. | Müşteriden alın; **Müşteriye e-posta gönder** ile elle yazın. |
| Ülkeye izin verilmedi | SMS, izinli ülkeler listesinde olmayan bir numaraya. | **Bildirimler**'de **SMS izinli ülkeler** listesine ekleyin. |
| Günlük sınır | Aynı alıcıya son 24 saatte üst sınıra ulaşıldı. | **Bildirimler**'de sınırı artırın. |

Başarısız gönderimler, artan bekleme sürelerinde en fazla 8 kez yeniden denenir. Kalıcı olarak başarısız olan işleri **Entegrasyon olayları** ekranında görürsünüz. Her olay için aynı kanala aynı sipariş için yalnızca bir kez gönderilir (tekrar gönderilmez).

> [!NOTE]
> Ödeme yapılmadan iptal edilen siparişlerde müşteriye bildirim gönderilmez. Deneme modundaki mesajlar **Mock gelen kutusu**'nda görünür.

## Yazdırma

Sipariş sayfasındaki **Yazdır** menüsü veya sipariş listesindeki toplu çubuk, tarayıcıdan yazdırılacak belgeler açar. Yazdırma ekranında üstteki araç çubuğundan **Yazdır**'ı seçin ve tarayıcınızın yazıcı penceresinde yazıcınızı belirleyin.

![Kargo etiketi önizlemesi](help/tr/order-print-label.png)

| Belge | Kâğıt | İçerik |
|---|---|---|
| **Kargo etiketi** | **100 × 150 mm**, sayfa başına bir etiket (termal etiket yazıcısı için) | Gönderen (mağazanız), alıcı adı/telefon/adres, kargo firması, **barkod** (takip numarası; yoksa sipariş numarası), sipariş no, adet, tarih |
| **Paket fişi** | A4 | Ürün adı, SKU ve adet. **Fiyat içermez** (müşteriye gidecek pakette fiyat görünmesin diye). **Fiyatları göster** kutusunu işaretlerseniz fiyatlar da eklenir. |
| **Fatura kopyası** | A4 | Siparişin fatura biçiminde dökümü. **Bilgi amaçlıdır, resmî fatura değildir.** |
| **Sipariş özeti** | A4 | Siparişin tek sayfalık özeti |

![Fatura kopyası önizlemesi](help/tr/order-print-invoice.png)

> [!WARNING]
> **Fatura kopyası resmî bir belge değildir.** Altında "Bilgi amaçlı kopyadır; resmî e-Fatura/e-Arşiv belgesi e-Faturam üzerinden düzenlenen belgedir" yazar. Müşteriye vermeniz gereken yasal belge, e-Faturam üzerinden kesilen faturadır; bağlantısını **Faturalar** kartından açabilirsiniz.

### Etiket yazdırma ipuçları

1. Yazıcı penceresinde kâğıt boyutunu **100 × 150 mm** seçin; kenar boşluğu **Yok**, ölçek **%100** olsun.
2. Barkod okunmuyorsa yazıcı kalitesini artırın ve ölçeği %100'de tutun.
3. Takip numarası yoksa etiket üzerinde "Takip no yok" yazar ve barkod sipariş numarasından üretilir; önce **Kargo oluştur** ile gerçek takip numarasını alın.
4. Birden çok siparişi toplu yazdırmak için listede kutuları işaretleyip alttaki **Etiket yazdır (N)** düğmesini kullanın.

## Trendyol siparişleri

**Trendyol** entegrasyonunu açtıysanız Trendyol'daki siparişleriniz de **Siparişler** listesine düşer. Bunları **Kaynak: Trendyol** filtresiyle ayırabilirsiniz. Kurulum için [Trendyol](/help/integrations#trendyol) bölümüne bakın.

- Siparişler **yaklaşık her 5 dakikada** bir otomatik çekilir (webhook kullanıyorsanız anında da gelir). Sipariş numarası `TY-` ile başlar.
- Her Trendyol siparişi yalnızca bir kez içeri alınır; tekrar çekildiğinde çoğaltılmaz, yalnızca durumu güncellenir.
- Ürün satırları SKU/barkod ile mağazanızdaki varyantlara eşlenir. Eşleşen varyantın stoğu otomatik **düşer** ("Trendyol satışı"). Eşleşmeyen satır, stok düşmeden kaydedilir ve günlüğe uyarı düşer; SKU'ları Trendyol'daki ile aynı tutun.
- Trendyol durumları OpenShelf durumlarına çevrilir (örneğin "Created" → **Ödendi**, "Shipped" → **Kargoya verildi**, "Delivered" → **Teslim edildi**, "Cancelled" → **İptal edildi**). Bu eşleme Trendyol'un güncel durum sözlüğüyle doğrulanmamıştır; sonuçları kendi panelinizle karşılaştırın.
- Ödeme Trendyol'da alındığı için bu siparişlerde OpenShelf'ten **iade yapılamaz**; iadeleri Trendyol panelinden yönetin.
- Kargo ve Trendyol Express: OpenShelf, Trendyol'a özel kargo akışını **varsaymaz ve uygulamaz**. Kargo bilgisini Trendyol satıcı panelinizde yönetin.
- **Fatura çifte kesilmesin:** Trendyol siparişleri için Trendyol kendi faturalama akışlarını sunabilir. e-Faturam'ı açmadan önce hangi siparişlerin hangi yoldan faturalandığını netleştirin ([e-Faturam](/help/integrations#e-faturam)).

> [!WARNING]
> Trendyol entegrasyonunun uç noktaları ve alan adlarının bir kısmı Trendyol'un güncel dokümanıyla **doğrulanmamıştır**. Canlıya geçmeden önce az sayıda gerçek ürünle deneyin, **Entegrasyon olayları** ve Trendyol panelini karşılaştırın.

## Sık yapılan hatalar

- **Sipariş "Ödeme bekleniyor"da kaldı ve müşteri ödediğini söylüyor:** Önce iyzico panelinde ödemeye bakın, ardından **Entegrasyon olayları**'nda hata var mı kontrol edin. Gerekirse [Sorun giderme](/help/troubleshooting#odeme-sorunlari).
- **Müşteriye bildirim gitmedi:** **Bildirimler** kartında nedenine bakın (sağlayıcı yok, ülke izni, günlük sınır).
- **İptal ile iadeyi karıştırmak:** İptal stoğu geri koyar; iade parayı geri verir.
- **Faturayı unutmak:** Otomatik fatura kapalıysa **Fatura kes** veya **Faturalar** sayfasını kullanın ([Faturalar](/help/invoices)).
- **Etiketi yanlış boyutta yazdırmak:** 100 × 150 mm seçin.
