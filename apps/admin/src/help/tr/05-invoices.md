# Faturalar

Bu bölümde siparişleriniz için faturanın nasıl kesildiğini öğrenirsiniz: ödeme sonrası **otomatik fatura**, siparişten bağımsız veya siparişe bağlı **manuel fatura**, e-Fatura ile e-Arşiv farkı, VKN/TCKN bilgileri, KDV hesabının nasıl yapıldığı ve kesilmiş bir faturanın iptali. Faturalar vergi mevzuatı bakımından **bağlayıcı belgelerdir**; bu nedenle bu bölümde uyarıları dikkatle okumanızı öneririz.

> [!DANGER]
> Gerçek modda **Fatura kes** işlemi yasal olarak bağlayıcı bir e-Fatura/e-Arşiv belgesi oluşturur ve sonradan **düzenlenemez**. Bu rehber ve panel **hukuki veya mali danışmanlık değildir**. Hangi belgeyi hangi müşteriye keseceğiniz mükellefiyet durumunuza bağlıdır; mali müşavirinize danışın. Fatura entegrasyonu (e-Faturam) canlı hesapla **doğrulanmamıştır**: gerçek fatura kesmeden önce kendi hesabınızla test edin ([e-Faturam](/help/integrations#e-faturam)).

Faturalar iki şekilde oluşur:

| Yol | Ne zaman | Nerede görürsünüz |
|---|---|---|
| **Otomatik fatura** | Müşteri ödeme yapınca, e-Faturam entegrasyonu açıksa sistem kendiliğinden keser. | Sipariş sayfası → **Faturalar** kartı |
| **Manuel fatura** | Siz **Faturalar** sayfasından (veya siparişten **Bu siparişten fatura oluştur** ile) hazırlar ve kesersiniz. | **Faturalar** sayfası |

Deneme modunda fatura kesmek yalnızca bir taklit üretir; e-Faturam'a veya vergi idaresine hiçbir şey gitmez.

## Otomatik fatura

**e-Faturam** entegrasyonu açıkken, her başarılı ödemeden sonra sistem arka planda bir "fatura kes" işi sıraya alar. Siz bir şey yapmazsınız.

### Adım adım ne olur?

1. Müşterinin ödemesi doğrulanır, sipariş **Ödendi** olur.
2. Sistem **fatura kesme** işini sıraya ekler (e-Faturam açıksa). Aynı siparişe ikinci kez iş eklenmez.
3. İş çalışırken sipariş bilgilerinden fatura hazırlanır:
   - Her ürün satırı, **KDV dahil** birim fiyatıyla ve ürünün KDV oranıyla eklenir.
   - Kargo ücreti varsa "Kargo" adlı bir satır eklenir.
   - Kupon/indirim varsa "İndirim" adlı eksi tutarlı bir satır eklenir.
   - Müşteri bilgisi **fatura adresinden**, yoksa teslimat adresinden alınır; müşteri "şirket" işaretlenmiş ve vergi numarası girmişse kurumsal müşteri sayılır.
4. Fatura türü belirlenir (**e-Fatura** veya **e-Arşiv**, [aşağıya](/help/invoices#e-fatura-ve-e-arsiv) bakın).
5. Fatura e-Faturam'a gönderilir; dönen **fatura numarası** ve **belge bağlantısı** siparişe kaydedilir.
6. Sipariş sayfasındaki **Faturalar** kartında tür, numara, durum ve **Aç** bağlantısı görünür.

### Aynı fatura iki kez kesilmez

Her sipariş ve fatura türü çifti için yalnızca bir kayıt tutulur ve e-Faturam'a gönderilen her istek benzersiz bir anahtar taşır ([idempotency](term:idempotency)). Bu yüzden ağ kesintisi, yeniden deneme veya düğmeye iki kez basma durumunda mükerrer fatura oluşmaz.

### Hata olursa

e-Faturam yanıt vermezse veya reddederse iş, artan bekleme süreleriyle birkaç kez yeniden denenir. Başarısız denemeler **Entegrasyon olayları** ekranında görünür; sipariş sayfasındaki **Fatura kes** düğmesi ile işi elle yeniden sıraya alabilirsiniz (sipariş **Ödendi** veya sonrası bir durumda olmalıdır; beklemede/iptal siparişler faturalanmaz).

### Otomatik faturanın sınırları

- **Otomatik fatura yalnızca web sitesi siparişleri içindir.** Trendyol siparişleri Trendyol'un kendi akışlarıyla faturalanıyor olabilir; çifte fatura kesmemek için e-Faturam sözleşmenizin kapsamını netleştirin.
- e-Faturam sözleşmenizin web siparişlerini kapsadığını yazılı teyit ettirmeden otomatik faturayı açmayın.
- Otomatik faturalar için panelde **iptal** düğmesi yoktur. İptal gerekiyorsa e-Faturam panelinizden ve mali müşavirinizle birlikte yapın. Panelden iptal yalnızca manuel faturalarda vardır ([Fatura iptali](/help/invoices#fatura-iptali)).
- Siparişin KDV oranı dışındaki satırlar (kargo, indirim) ilk ürünün KDV oranıyla hesaplanır. Farklı oranlı karma sepetlerde manuel faturayı tercih edin.

### Otomatik faturayı kapatmak

Otomatik fatura, e-Faturam entegrasyonunu **Entegrasyonlar** ekranında kapatınca durur. Ödeme sonrası fatura kesilmesini istemiyorsanız e-Faturam'ı kapalı tutup tüm faturaları manuel kesebilirsiniz.

## Manuel fatura

Manuel fatura, bir siparişe bağlı olabilen ya da tamamen bağımsız olarak (örneğin telefonla/depodan yapılan satış) hazırlayabileceğiniz faturadır. Her fatura taslak olarak başlar; kesmeden önce serbestçe düzenlenir.

### Siparişten fatura oluşturma

1. **Siparişler** → ilgili sipariş (örnek: **DEMO-1004**).
2. Üstteki **Bu siparişten fatura oluştur** düğmesine tıklayın.
3. Fatura düzenleyici, siparişin bilgileriyle dolu açılır: müşteri, fatura adresi, ürün satırları (KDV dahil fiyatlarla), varsa kargo ve indirim.
4. Kontrol edip gerekirse düzeltin; **Taslağı kaydet** veya doğrudan **Fatura kes**'e geçin.

### Sıfırdan fatura oluşturma

1. Sol menüden **Faturalar**'a, sağ üstten **Manuel fatura**'ya tıklayın.
2. **Müşteri** kartını doldurun ([VKN ve TCKN](/help/invoices#vkn-ve-tckn) bölümüne bakın). **Kayıtlı müşteri bul** kutusu, kayıtlı müşteriyi ad/e-posta/telefonla aratıp alanları doldurur; yine de düzenleyebilirsiniz.
3. **Satırlar** kartında **Katalogdan ürün ekle** kutusuna ürün adı veya stok kodu yazın (örnek: `VAZO-S-KREM`), listeden seçin. Fiyat, KDV oranı ve ürün adı otomatik dolar. Katalogda olmayan bir kalem için **Özel satır ekle** düğmesini kullanın.
4. Her satırda **ad**, **adet**, **birim fiyat**, **KDV %** ve **indirim** alanlarını düzenleyebilirsiniz. Oklarla satır sırasını değiştirin, çöp kutusuyla satırı silin.
5. **Seçenekler** kartında **Fiyatlara KDV dahil** anahtarını, **Para birimi**'ni, **Fatura tarihi**'ni ve **Notlar**'ı belirleyin.
6. Sağdaki **Özet** kartında ara toplam, KDV ve genel toplamı ve faturanın **e-Fatura mı e-Arşiv mi** olacağını görün. Sarı uyarılar eksikleri belirtir.
7. **Önizle** ile sunucunun yaptığı hesabı kontrol edin.
8. **Taslağı kaydet** ile kaydedin; hazırsanız **Fatura kes**'e basın.

![Fatura düzenleyici](help/tr/invoice-editor.png)

![Fatura listesi](help/tr/invoices-list.png)

### Alanlar

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Şirket (e-Fatura adayı)** | Müşteri bir şirketse açın | Açık | Açınca VKN ve vergi dairesi alanları görünür; bireysel müşteride kapalı kalmalıdır. |
| **Ad soyad / Şirket unvanı** (zorunlu) | Faturada görünecek ad/unvan | Ayşe Yılmaz | Ticari unvan tam yazılmalı. |
| **E-posta** | Müşteri e-postası | ayse@mail.com | Faturayı e-postayla göndermek için gerekir. |
| **VKN (10 hane)** / **TCKN (11 hane, isteğe bağlı)** | Vergi/kimlik numarası | 1234567890 | Yalnızca rakam, 10 veya 11 hane. |
| **Vergi dairesi** | Şirketin vergi dairesi | Kadıköy | Yalnızca şirketlerde. |
| **Adres** (zorunlu) | Fatura adresi | Moda Cad. No:12 | En az 3 karakter. |
| **Şehir** (zorunlu) | İl | İstanbul | |
| **Kalem / Açıklama** | Faturada görünen kalem adı | Seramik Vazo | En fazla 200 karakter. |
| **Adet** | Miktar | 2 | Ondalık olabilir (1,5). |
| **Birim fiyat** | Birim tutar | 349,90 | KDV dahil/hariç seçime göre. |
| **KDV %** | Satırın KDV oranı | 20 | Katalogdan eklenirse ürünün oranı gelir. |
| **İndirim** | Satıra uygulanan **tutar** indirimi | 50 | Yüzde değil, para birimi cinsinden. Satır tutarını aşamaz. |
| **Fiyatlara KDV dahil** | Fiyatlar brüt mü | Açık | Aşağıdaki [KDV hesabı](/help/invoices#kdv-hesabi) bölümüne bakın. |
| **Para birimi** | 3 harfli kod | TRY | |
| **Fatura tarihi** | Fatura günü | 26.10.2026 | Boşsa bugün. |
| **Notlar** | Faturanın altına basılacak not | KDV istisna açıklaması | En fazla 1000 karakter. |

### Önizleme ve uyarılar

**Önizle** düğmesi, sunucunun yaptığı hesaplamayı gösterir (ekrandaki hesapla birebir aynıdır). Özet kartındaki sarı uyarılar sizi olası hatalara karşı uyarır, ancak kesmeyi engellemez (sıfır toplam ve negatif satır hariç):

| Uyarı | Anlamı |
|---|---|
| Şirket faturasında vergi numarası yok / VKN 10 hane değil | Fatura **e-Arşiv** olarak kesilir. |
| Şirket için vergi dairesi boş | Vergi dairesini yazın. |
| Bireysel müşteride 10 haneli VKN | Müşteriyi "şirket" olarak işaretlemeyi unutmuş olabilirsiniz. |
| Toplam 0 | Fatura kesilemez. |
| Satır indirimi satır tutarını aşıyor | Kayıt reddedilir. |
| KDV %0 ve not yok | KDV istisna açıklaması (Notlar) gerekebilir. |
| Birim fiyat 0 | Satırı kontrol edin. |
| Müşteri e-postası yok | Faturayı e-postayla gönderemezsiniz. |
| Vergi numarası e-Fatura mükellefi değil | Fatura e-Arşiv olarak kesilir. |

### Faturayı kesme (adım adım)

1. Taslakta tüm alanlar geçerliyken **Fatura kes**'e basın. Eksik alanlar vurgulanır ("Önce vurgulanan alanları düzeltin").
2. Açılan **Bu fatura kesilsin mi?** penceresinde uyarıları ve şu notu okuyun: "Bu işlem e-Faturam üzerinden **yasal olarak bağlayıcı bir fatura** oluşturur ve sonradan düzenlenemez."
3. **Fatura kes**'i onaylayın.
4. İşlem birkaç saniye sürer. Başarılıysa fatura **Kesildi** durumuna geçer, numara ve belge bağlantısı görünür.
5. Hata olursa ("Fatura sağlayıcı hatası"), fatura **Hata** durumuna geçer; düzeltip **Yeniden kesmeyi dene**'ye basabilirsiniz.

### Fatura durumları

| Durum | Anlamı | Yapılabilecekler |
|---|---|---|
| **Taslak** | Henüz kesilmedi. | Düzenle, sil, kes |
| **Kesiliyor** | Sağlayıcıya gönderiliyor. | Bekleyin. Takılı kalırsa (5 dakikadan uzun) yeniden denenebilir. |
| **Kesildi** | Resmî fatura oluştu. **Salt okunur.** | Yazdır, müşteriye e-postayla gönder, iptal et |
| **Hata** | Kesme başarısız. | Düzenle, tekrar dene |
| **İptal ediliyor** | İptal sağlayıcıya gönderiliyor. | Bekleyin |
| **İptal edildi** | Fatura iptal edildi. | Yok |

Kesilmiş faturada **Yazdır**, **Müşteriye e-posta gönder** ve **Faturayı iptal et** düğmeleri bulunur. E-posta düğmesi, alıcı ve konu dolu şekilde e-posta yazma ekranını açar ve faturanın PDF bağlantısını ekler ([E-posta yazma](/help/email#e-posta-yazma)).

### Güvenlik ve limitler

- **Saatte 30 işlem sınırı:** Her yönetici hesabı, saatte en fazla 30 fatura kesme/iptal işlemi yapabilir ("Çok fazla fatura işlemi, daha sonra tekrar deneyin"). Taslak kaydetme bu sınıra dahil değildir.
- **Mükerrer koruması:** Aynı faturaya aynı anda iki kişi basarsa yalnızca biri işlem yapar ("Fatura kesiliyor"); kesilmiş faturanın ikinci kez kesilmesi engellenir ("Fatura zaten kesilmiş").
- Fatura kesmek, iptal etmek ve taslak yazmak **yönetici** ve **mağaza sahibi** yetkisindedir; **personel** yalnızca görüntüler.
- Toplamı sıfır olan fatura kesilemez.

> [!NOTE]
> e-Faturam'a gönderilen referans, faturanın bağlı olduğu sipariş numarasıdır; sipariş yoksa sistem `MAN-` ile başlayan bir referans üretir. **Resmî fatura numarasını e-Faturam verir** ve kesildikten sonra listede görünür.

## e-Fatura ve e-Arşiv

Türkiye'de elektronik fatura iki türdür. Hangisinin kesileceğini sistem sizin yerinize, müşteri bilgisine bakarak belirler:

| | **e-Fatura** | **e-Arşiv** |
|---|---|---|
| Kime | e-Fatura mükellefi olan **şirketlere** | e-Fatura mükellefi olmayanlara, **bireylere** ve tüketicilere |
| Müşteri bilgisi | VKN (10 hane) zorunlu | Ad soyad, adres; TCKN isteğe bağlı |
| Teslim | Alıcının e-Fatura sistemine iletilir | Müşteriye e-posta/PDF ile verilir |
| Panelde etiket | **e-Fatura (kurumsal)** | **e-Arşiv (bireysel)** |

Sistemin kararı şöyledir:

1. Müşteri **şirket** değilse veya geçerli 10 haneli VKN yoksa: **e-Arşiv**.
2. Şirket ve 10 haneli VKN varsa ve e-Faturam entegrasyonundaki **Vergi no e-Fatura mükellefi sorgula** seçeneği **kapalıysa**: **e-Fatura**.
3. Seçenek **açıksa**, VKN e-Fatura mükellefleri arasında sorgulanır: mükellefse **e-Fatura**, değilse veya sorgu başarısız olursa **e-Arşiv**.

Önizlemede ve düzenleyicideki **Özet** kartında, faturanın hangi türde kesileceği rozetle gösterilir. e-Faturam çekmecesindeki **e-Fatura seri** ve **e-Arşiv seri** (3 harf) alanları, her tür için fatura seri ön ekini belirler (örneğin `ABC`).

> [!WARNING]
> Önizlemedeki tür, sağlayıcıdan sorgulanabilirse sağlayıcı sonucuna, sorgulanamazsa yerel kurala (şirket + 10 haneli VKN = e-Fatura) göre belirlenir. Hangi belgenin yasal olarak gerekli olduğuna mali müşaviriniz karar verir. Sistemin kararı hukuki tavsiye değildir. Ayrıca [e-Fatura](term:efatura) ve [e-Arşiv](term:earsiv) sözlük tanımlarına bakabilirsiniz.

## VKN ve TCKN

İki numara birbirine karıştırılır:

| | **VKN** (Vergi Kimlik Numarası) | **TCKN** (T.C. Kimlik Numarası) |
|---|---|---|
| Hane | 10 | 11 |
| Kimin | Şirketlerin ve vergi mükellefi işletmelerin | Gerçek kişilerin |
| Faturada | Kurumsal müşteriler için zorunlu | Bireysel müşteride isteğe bağlı |

Bkz. sözlükte [VKN](term:vkn) ve [TCKN](term:tckn), ayrıca [vergi dairesi](term:taxoffice).

- **Kendi vergi numaranız** (satıcı) **Mağaza ayarları → Genel → Vergi no** alanına yazılır. Şahıs firmasıysanız genellikle TCKN, şirketseniz VKN yazarsınız; mali müşavirinize danışın.
- **Müşteri numarası** düzenleyicide **VKN (10 hane)** veya **TCKN (11 hane, isteğe bağlı)** alanında girilir. Alan yalnızca rakam kabul eder, 10–11 haneyi aşamaz.
- **Vergi dairesi**, yalnızca şirket müşterilerde sorulur.

> [!TIP]
> Müşteri "şirket adına fatura" istiyorsa **Şirket (e-Fatura adayı)** anahtarını açıp VKN ve vergi dairesini mutlaka girin. 11 haneli bir sayı VKN alanına yazılırsa şirket faturası **e-Arşiv** olarak kesilir.

## KDV hesabı

Sistem para tutarlarını kuruş (tam sayı) olarak saklar ve her satırı ayrı yuvarlar (0,5 ve üstü yukarı). Ekrandaki hesap, sunucunun hesabıyla birebir aynıdır.

**Fiyatlara KDV dahil** anahtarı iki farklı mantık kurar:

### Açık: fiyatlar KDV dahildir (brüt)

Girdiğiniz birim fiyat müşterinin ödediği tutardır; KDV bunun içindedir. Satırın KDV'si ayrıştırılır.

Örnek: **349,90 ₺** brüt, KDV %20, adet 1:

- KDV hariç tutar (net) = 349,90 ÷ 1,20 = **291,58 ₺**
- KDV = 349,90 − 291,58 = **58,32 ₺**
- Toplam = **349,90 ₺**

### Kapalı: fiyatlar KDV hariçtir (net)

Girdiğiniz fiyata KDV eklenir.

Örnek: **291,58 ₺** net, KDV %20:

- KDV = 291,58 × %20 = **58,32 ₺**
- Toplam = **349,90 ₺**

### İndirimli satır

İndirim satır tutarından düşülür. **349,90 ₺** brüt, **50 ₺** indirim, KDV %20: ödenecek brüt 299,90 ₺ → net 249,92 ₺, KDV 49,98 ₺.

### e-Faturam'a nasıl gönderilir?

e-Faturam'ın beklediği birim fiyat **KDV dahil** tutardır. Sistem, her satırın indirim ve KDV'yi içeren brüt tutarını hesaplar ve bunu gönderir; böylece e-Faturam'daki toplam sizin ekranınızdaki toplama eşit olur:

- Adet tam sayıysa ve brüt tutar adede tam bölünüyorsa: `adet × birim brüt fiyat`.
- Adet ondalıksa (1,5) veya tutar tam bölünmüyorsa: kuruş kaybolmasın diye satır **tek satır** olarak, adı "Ürün (1,5 x)" biçiminde gönderilir.

> [!WARNING]
> KDV oranı **%0** olan satır için fatura notuna istisna/muafiyet gerekçesini yazın ("KDV %0 ve not yok" uyarısı bu yüzdendir). Hangi oranın uygulanacağı ve istisna koşulları mali müşavirinizin sorumluluğundadır.

## Fatura iptali

Yalnızca **Kesildi** durumundaki manuel faturalar panelden iptal edilebilir.

1. **Faturalar** → ilgili faturayı açın.
2. Sağdaki **Faturayı iptal et** düğmesine tıklayın (yönetici veya mağaza sahibi).
3. Açılan onay penceresinde ("Bu fatura iptal edilsin mi?") onaylayın.
4. Sistem iptal talebini e-Faturam'a iletir. Başarılıysa fatura **İptal edildi** olur.
5. Sağlayıcı iptali reddederse fatura **Kesildi** durumunda kalır ve hata mesajı gösterilir.

> [!DANGER]
> Vergi mevzuatında fatura iptali; belgenin türüne (e-Fatura/e-Arşiv), alıcının durumuna ve geçen süreye göre farklı kurallara tabidir. İptal yerine **iade faturası** düzenlemek gerekebilir. İptal, saatte 30 işlem sınırına dahildir. Panelden iptal etmeden önce mali müşavirinize danışın.

- İade yapmak (para iadesi) faturayı **otomatik iptal etmez**. Ayrı bir işlemdir ([İade](/help/orders#iade)).
- Otomatik kesilen sipariş faturaları için panelde iptal düğmesi yoktur; e-Faturam panelinizden yapın.

## Sık hatalar

| Belirti | Neden | Çözüm |
|---|---|---|
| **"Fatura sağlayıcısı etkin değil"** | e-Faturam entegrasyonu kapalı veya hiç kurulmamış. | **Entegrasyonlar**'da e-Faturam'ı yapılandırıp açın. Ya da deneme için Mock modunu açın. |
| **"Fatura toplamı sıfırdan büyük olmalı"** | Tüm satırlar 0 ₺ veya indirim satırı aşıyor. | Fiyat/indirimi düzeltin. |
| **Fatura e-Arşiv çıktı, e-Fatura bekliyordum** | Şirket işaretli değil, VKN 10 hane değil ya da müşteri e-Fatura mükellefi değil. | Müşteri bilgilerini ve mükellefiyeti doğrulayın. |
| **"Çok fazla fatura işlemi"** | Saatte 30 işlem sınırı. | Bir süre bekleyin. |
| **Fatura "Hata" durumunda** | e-Faturam isteği reddetti veya erişilemedi (yanlış kullanıcı adı/şifre, yanlış servis URL'si, sözleşme kapsamı dışında müşteri/kaynak). | Hata mesajını okuyun; e-Faturam bağlantısını **Bağlantıyı test et** ile sınayın; düzeltip **Yeniden kesmeyi dene**. |
| **Aynı siparişe iki fatura** | Hem otomatik fatura hem manuel fatura kesildi. | Siparişten manuel fatura oluşturmadan önce **Faturalar** kartında otomatik faturanın kesilip kesilmediğine bakın. |
| **Fatura kopyasını resmî sanmak** | **Yazdır → Fatura kopyası** bilgi amaçlıdır. | Resmî belge e-Faturam'daki PDF'tir. |
| **Yanlış KDV oranı** | Katalogdaki oran farklı veya özel satırda yanlış girildi. | Kesmeden önce satırları ve **Özet**'i kontrol edin. |
| **Fatura kesildi, düzeltmek istiyorum** | Kesilmiş fatura düzenlenemez. | İptal (mümkünse) veya düzeltme belgesi için mali müşavirinize danışın. |

Diğer fatura sorunları için [Sorun giderme](/help/troubleshooting#fatura-sorunlari) bölümüne bakın.
