# Sorun giderme ve SSS

Bu bölümde en sık karşılaşılan sorunları "belirti, neden, çözüm" düzeninde bulacaksınız. Panel bir hata gösterdiğinde ne olduğunu ve ne yapmanız gerektiğini söyler; burada aynı mesajların arkasındaki sebepleri ve ek ipuçlarını açıklıyoruz. Hata kodları parantez içinde verilir; destek isterken bu kodu iletmeniz işi hızlandırır.

> [!TIP]
> Önce şunlara bakın: sayfayı yenileyin, çıkış yapıp tekrar girin, **Entegrasyon olayları** sayfasına göz atın. Bunlar sorunların çoğunu açıklar.

## Giriş sorunları

| Belirti | Neden | Çözüm |
|---|---|---|
| "Çok fazla hatalı deneme, daha sonra tekrar deneyin" (`account_locked`) | Aynı e-posta ve IP'den 15 dakikada 5, ya da aynı IP'den 20 hatalı giriş oldu | 15 dakika bekleyin. Bu süre dolmadan doğru şifre de kabul edilmez. [Kilitlenme](/help/security#kilitlenme) |
| "Çok fazla istek, yavaşlayın" (`rate_limited`) | Kısa sürede çok fazla istek yapıldı (örneğin girişte 15 dakikada 20'den fazla) | Bir dakika bekleyip yeniden deneyin; yanıttaki bekleme süresi bilgisine uyun |
| "Robot doğrulaması gerekli" (`turnstile_required`) / başarısız (`turnstile_failed`) | Art arda hatalı denemeden sonra doğrulama isteniyor | Doğrulamayı tamamlayıp yeniden deneyin; sürekli başarısızsa tarayıcı eklentilerini kapatın |
| Şifre doğru ama giremiyorum | İki adımlı kod yanlış, süresi geçmiş ya da daha önce kullanılmış | Telefonun saatini otomatik ayara alın, yeni kodu bekleyin. Aynı kod iki kez kabul edilmez |
| Telefon kayıp, iki adımlı kod yok | Kurtarma kodu yoktur | Kurulumda not ettiğiniz anahtarla yeni telefona ekleyin; yoksa teknik müdahale gerekir. [İki adımlı doğrulama](/help/security#iki-adimli-dogrulama) |
| "Oturum süresi doldu" | 2 saat hareketsizlik ya da 12 saat sınırı | Yeniden giriş yapın. [Oturumlar](/help/security#oturumlar) |
| Kaydederken "Origin not allowed" / "Geçersiz CSRF jetonu" | Panele sabitlenen adresten farklı bir adresle girdiniz ya da sayfa çok eski | Doğru adresten girin, sayfayı yenileyip çıkış-giriş yapın. Adresi sabitlediyseniz [Alan adı](/help/going-live#alan-adi) |
| Kurulum sayfası "yapılandırma eksik" (503 `misconfigured`) | `APP_ENCRYPTION_KEY` yok ya da biçimi hatalı | Cloudflare'de Worker sırrı olarak 32 baytlık base64 bir anahtar tanımlayıp yeniden deneyin |
| Kurulumda "Kurulum zaten tamamlanmış" (`setup_locked`) | Sahip hesabı zaten oluşturuldu | Normal girişi kullanın; şifre için başka bir sahibe başvurun |
| Kurulumda "Geçersiz kurulum kodu" (`invalid_setup_token`) / "kurulum kodu tanımlı değil" (`setup_disabled`) | Yanlış `SETUP_TOKEN` ya da hiç tanımlanmamış | Cloudflare'deki `SETUP_TOKEN` sırrını kontrol edin |
| Panel yerine vitrin ya da boş sayfa açılıyor | Adres `/admin/` ile bitmiyor ya da yayın eksik | `/admin/` adresini açın; hâlâ boşsa siteyi yeniden yayınlayın |
| Şifre değişirken "Mevcut şifre yanlış" (`invalid_password`) | Mevcut şifre hatalı yazıldı | Doğrusunu yazın |
| "En az bir etkin sahip gerekli" (`last_owner`) | Son sahibi silmeye/düşürmeye çalıştınız | Önce başka bir hesabı sahip yapın |
| "E-posta zaten kullanımda" (`email_taken`) | Bu e-postayla başka kullanıcı var | Farklı e-posta yazın |

> [!NOTE]
> Panelde "şifremi unuttum" bağlantısı yoktur. Sahip hesabı başka bir kullanıcının şifresini sıfırlayabilir.

## Ödeme sorunları

| Belirti | Neden | Çözüm |
|---|---|---|
| Müşteri "ödeme başlatılamadı" görüyor (`payment_provider_error`) | iyzico isteği reddetti ya da ulaşılamadı | **Entegrasyon olayları**'na bakın, anahtarları ve ortamı (Canlı/Sandbox) kontrol edin |
| "Ödeme sağlayıcı etkin değil" (`payment_unavailable`) | iyzico kapalı ya da eksik | **Entegrasyonlar → iyzico** kartını etkinleştirin ([iyzico](/help/integrations#iyzico)) |
| Müşteri ödedi ama sipariş "Ödeme bekleniyor" | Bildirim henüz gelmedi ya da doğrulanamadı | Birkaç dakika bekleyin, ardından siparişi açıp ödeme durumuna bakın. [Ödeme doğrulama](/help/orders#odeme-dogrulama) |
| Entegrasyon olaylarında "tutar/para birimi uyuşmuyor" | Ödenen tutar siparişle eşleşmedi | Sipariş onaylanmaz; iyzico panelinden ödemeyi kontrol edin, gerekirse iade edin |
| "Ödeme gelmiş ama sipariş iptal" (geç ödeme) | Stok rezervasyonu süresi dolup sipariş iptal edilmişti, sonra ödeme geldi | Müşteriye **elle iade** yapın; rezervasyon süresini artırmayı düşünün |
| "Yeterli stok yok" (`insufficient_stock`) / "Bazı ürünler artık mevcut değil" (`items_unavailable`) | Stok bitti ya da başka biri aldı | Müşteri sepetini güncellemeli; stoğu kontrol edin |
| "Bu sepet zaten ödemeye alındı" (`cart_already_checked_out`) | Aynı sepetten ikinci ödeme denendi | Müşteri sepetini yeniden oluşturmalı (ürünleri tekrar ekleyip devam) |
| "Çok fazla ödenmemiş sipariş" (`too_many_pending_orders`) | Müşterinin tamamlanmamış çok sayıda siparişi var | Süresi dolmalarını bekleyin ya da tamamlayın |
| "Misafir ödeme kapalı" (`guest_checkout_disabled`) | **Ödeme ve sipariş** ayarında misafir ödeme kapalı | Ayarı açın ya da müşteri hesabıyla devam etsin |
| Kupon "zaten kullanıldı" (`coupon_already_used`) / "kullanım sınırı doldu" (`coupon_exhausted`) | Kupon bu e-postayla kullanılmış ya da tükenmiş | Kuponun sınırını gözden geçirin. [Kuponlar](/help/catalog#kuponlar) |
| İade: "Ödenen tutarı aşıyor" (`refund_exceeds_payment`) | İade tutarı ödemeden büyük | Tutarı düşürün |
| İade: "Başarılı ödeme yok" (`no_payment`) | Siparişin ödenmiş kaydı yok | İade yerine siparişi iptal edin |
| İade: "Sağlayıcı iadeyi reddetti" (`refund_failed`) | iyzico reddetti | iyzico panelini ve ayrıntıları kontrol edin; başarısız iade denetim kaydındadır |
| İade: "Sağlayıcı iadeyi desteklemiyor" (`refund_unsupported`) | Ödeme sağlayıcının iadesi yok | İadeyi sağlayıcının panelinden yapın |
| İade: "Deneme/gerçek uyuşmazlığı" (`mock_mismatch`) | Sahte (mock) ödeme gerçek modda ya da gerçek ödeme mock modda iade ediliyor | Ödemenin türüne göre deneme modunu açın/kapatın. [Mock'u kapatma](/help/going-live#mock-u-kapatma) |
| Deneme modu açılamıyor: `mock_not_allowed` | Sunucuda `ALLOW_MOCK` tanımlı değil | Yalnızca deneme/demo sitede `ALLOW_MOCK=true` tanımlayın, canlıda tanımlamayın |
| Deneme modu açılamıyor: `real_payment_enabled` | Gerçek ödeme sağlayıcı etkin | Önce iyzico kartını devre dışı bırakın |
| Deneme modu açılamıyor: `real_orders_in_flight` | Gerçek ödenmiş/hazırlanan/kargolanmış siparişler var | Bu siparişleri tamamlayın ya da teslim edin |
| Gerçek entegrasyon değişmiyor: `mock_mode_active` | Deneme modu açık | **Sistem** sekmesinde kapatın |

> [!DANGER]
> Canlı mağazada deneme modunu açmayın. Müşteriden para alınmadan sipariş oluşur. Yalnızca deneme sitelerinde kullanın.

## Fatura sorunları

| Belirti | Neden | Çözüm |
|---|---|---|
| "Fatura sağlayıcı etkin değil" (`no_invoicing_provider` / `invoicing_unavailable`) | e-Faturam kapalı ya da yapılandırılmamış | **Entegrasyonlar → Trendyol e-Faturam** etkinleştirin ya da deneme modunu kullanın. [e-Faturam](/help/integrations#e-faturam) |
| "Fatura kesilemedi: sağlayıcı hatası" (`issue_failed`) | Fatura sağlayıcısı isteği reddetti (çoğunlukla VKN/TCKN, adres ya da seri hatası) | Mesajdaki ayrıntıya bakın, alıcı bilgisini düzeltip yeniden deneyin. [VKN ve TCKN](/help/invoices#vkn-ve-tckn) |
| "Fatura zaten kesildi" (`already_issued`) | İkinci kesim denendi | Yeni fatura gerekmiyor |
| "Fatura kesiliyor ya da artık kesilemez" (`issue_in_progress`) | Başka bir işlem sürüyor | Birkaç dakika bekleyip sayfayı yenileyin |
| "Yalnızca taslak ya da hatalı faturalar düzenlenebilir" (`not_editable`) | Kesilmiş fatura düzenlenemez | İptal edip yenisini kesin. [Fatura iptali](/help/invoices#fatura-iptali) |
| "Yalnızca taslaklar silinebilir" (`not_deletable`) | Kesilmiş fatura silinemez | İptal edin |
| "Yalnızca kesilmiş faturalar iptal edilebilir" (`invalid_state`) | Fatura zaten iptal ya da kesilmemiş | Durumu kontrol edin |
| "Fatura toplamı 0'dan büyük olmalı" (`zero_total`) | Tüm satırlar sıfır | Tutarları düzeltin |
| "Satır indirimi tutarı aşıyor" (doğrulama hatası) | İndirim satır toplamından büyük | İndirimi azaltın |
| "Sipariş ödenmemiş" (`invalid_order_state`) | Ödenmemiş siparişe fatura kesilmeye çalışıldı | Önce ödeme gelmeli |
| "Çok fazla fatura işlemi" (`rate_limited`) | Kısa sürede çok işlem | Biraz bekleyin |

Fatura hatalarının çoğu alıcı bilgisindendir: VKN 10, TCKN 11 hane olmalı. Ayrıntı: [Faturalar](/help/invoices#sik-hatalar).

## E-posta ve SMS sorunları

| Belirti | Neden | Çözüm |
|---|---|---|
| "E-posta sağlayıcı etkin değil" (`no_email_provider`) | Cloudflare E-posta kapalı | **Entegrasyonlar → Cloudflare E-posta** etkinleştirin ([Cloudflare E-posta](/help/integrations#cloudflare-e-posta)) |
| "Sağlayıcı mesajı reddetti" (`send_failed`) | Gönderen alan adı doğrulanmamış, alıcı izinsiz (Beta/ücretsiz planda yalnızca doğrulanmış adresler) ya da anahtar hatalı | **E-postalar → Gönderilenler**'de hata ayrıntısına bakın, alan adını ve planı kontrol edin, **Yeniden gönder** deneyin |
| "Şu yer tutucuları önce değiştirin: {{...}}" (`unresolved_placeholders`) | E-postada doldurulmamış `{{...}}` alanı kaldı | Yer tutucuyu gerçek bilgiyle değiştirin. [E-posta yazma](/help/email#e-posta-yazma) |
| "Saatlik limit doldu (hesabınız için 30/saat)" (`rate_limited_admin`) | Bir yönetici saatte en çok 30 e-posta | Bir saat bekleyin |
| "Günlük mağaza limiti doldu (100/gün)" (`rate_limited_total`) | Mağaza genelinde günde 100 e-posta | Ertesi güne bırakın. [Gönderim limitleri](/help/email#gonderim-limitleri) |
| "Bu alıcı için günlük limit doldu (5/gün)" (`rate_limited_recipient`) | Aynı kişiye günde 5 | Yarın deneyin |
| "Geçersiz alıcı" (`invalid_recipient`) | E-posta biçimi hatalı ya da telefon `+905301234567` biçiminde değil | Düzeltin. [E.164](term:e164) |
| "Yalnızca başarısız e-postalar yeniden gönderilir" / "zaten yeniden gönderiliyor" (`invalid_state`) | Durum uygun değil | Durumu kontrol edin |
| Bildirim "Atlandı: ülke izinli değil" (`country_not_allowed`) | SMS alıcısının ülke kodu izin listesinde yok (varsayılan yalnızca `+90`) | **Bildirimler** ayarında ülke listesine ekleyin |
| Bildirim "Atlandı: günlük sınır" (`daily_cap`) | Alıcı başına günlük SMS/e-posta sınırına ulaşıldı | Sınırı gözden geçirin ya da bekleyin |
| Bildirim "Atlandı: alıcı yok / geçersiz" (`no_recipient`, `invalid_recipient`) | Müşteride telefon/e-posta yok ya da biçim hatalı | Sipariş bilgisini kontrol edin |
| SMS gitmiyor, başlık reddedildi | [SMS başlığı](term:smsheader) sağlayıcıda onaylı değil | Sağlayıcıda onaylatın; en çok 11 karakter, Türkçe karakter/boşluk kullanmayın |
| Test mesajı: "Çok fazla istek" (`rate_limited`) | Test gönderimi yönetici başına saatte 5, IP başına 10 | Bekleyin |
| "Bildirim sağlayıcı yok" (test gönderimi) | İlgili kanalın sağlayıcısı etkin değil | Entegrasyonu etkinleştirin ([Netgsm](/help/integrations#netgsm), [Twilio](/help/integrations#twilio)) |

Mesajların hiç gitmediğini düşünüyorsanız deneme modu açık olabilir: mesajlar **Mock gelen kutusu**na düşer. [Bildirim ayarları](/help/store-settings#bildirimler) ve [Sipariş bildirimleri](/help/orders#siparis-bildirimleri) sayfalarına bakın.

## Entegrasyon hataları

**Entegrasyon olayları** sayfası, dış hizmetlerle yaşanan sorunları listeler (düzey: Bilgi, Uyarı, Hata). Arka plan işleri ([outbox](term:outbox)) başarısız olursa sistem gittikçe uzayan aralıklarla (30 sn'den başlayıp en çok 1 saat) otomatik yeniden dener. Durumlar: **Sırada**, **Çalışıyor**, **Tamamlandı**, **Hata (yeniden denenecek)**, **Başarısız (vazgeçildi)**.

![Entegrasyon olayları](help/tr/integration-events.png)

| Belirti | Neden | Çözüm |
|---|---|---|
| Kartta "Bağlantıyı sına" başarısız | Anahtar hatalı, ortam yanlış ya da sağlayıcı geçici sorunlu | Anahtarı yeniden girin, Sandbox/Canlı seçimini kontrol edin. [Entegrasyonları test etme](/help/integrations#entegrasyonlari-test-etme) |
| "Entegrasyon yapılandırması geçersiz" (doğrulama hatası) | Zorunlu alan eksik ya da biçim hatalı | İşaretli alanları düzeltin |
| "Webhook doğrulaması başarısız" (`invalid_signature`) | Bildirimin imzası uyuşmuyor (yanlış gizli anahtar ya da sahte istek) | Anahtarı kontrol edin; tanımadığınız kaynaktan geliyorsa dikkate almayın |
| İş "Başarısız (vazgeçildi)" | Tüm denemeler tükendi | Sorunu giderin ve **Yeniden dene** ile işi tekrar başlatın |
| "İş bulunamadı ya da zaten çalışıyor" (`not_found`) | İş bitmiş ya da çalışıyor | Sayfayı yenileyin |
| Arka plan işleri hiç çalışmıyor | Zamanlanmış görev ([cron](term:cron)) kapalı ya da çok seyrek | Yapılandırmada cron'un tanımlı olduğunu doğrulayın |
| Pazarlama olayında `skipped_no_consent` | Müşteri çerez iznini vermedi | Normaldir. [Analitik](/help/analytics#cerez-onayi) |
| Pazarlama olayında `failed` | Kimlik ya da jeton hatalı | Meta/GA4 kartını kontrol edin. [Analitik: test etme](/help/analytics#test-etme) |
| "Geçersiz olay" / "Yalnızca sunucu olayı" (`unknown_event`, `server_only_event`) | Satın alma/iade olayı tarayıcıdan gönderilmeye çalışıldı | Sunucu bunları kendisi üretir; müdahale gerekmez |

Kodlar tablodaki gibi API'den döner; panel çoğunu Türkçe açıklamayla gösterir.

## SSS

**Panelde yaptığım değişiklik vitrinde görünmüyor.**
Sayfalar kısa süre önbellekte tutulur ([önbellek](term:cache)). 5-10 dakika bekleyin ya da sayfayı sert yenileyin. Panelde gördüğünüz veri her zaman günceldir.

**Mağazam Google'da görünmüyor.**
**Mağaza ayarları → SEO**'da arama motoru anahtarını açın. Ardından Search Console'da site haritasını gönderin; sonuçlar haftalar sürebilir. [SEO](/help/seo#canonical-ve-noindex).

**Ürünü sildim, siparişler ne olur?**
Satışı yapılmış ürün silinmez, arşive alınır. Hiç satılmamışsa kalıcı silinir.

**Stok eksiye düşebilir mi?**
Hayır. Rezerve edilenin altına çekmeye çalışırsanız "stok, ayrılan miktarın altına düşemez" (`stock_below_reserved`) uyarısı alırsınız. [Stok ve stok defteri](/help/catalog#stok-ve-stok-defteri).

**Yüklediğim görsel kabul edilmedi.**
Yalnızca png, jpeg, webp, gif ve avif kabul edilir; SVG reddedilir (`unsupported_media_type`), dosya içeriği türüne uymuyorsa `mime_mismatch`, çok büyükse `payload_too_large` alırsınız. Görseli dönüştürüp küçültün.

**Ürün içe aktarmada hata alıyorum.**
Dosya 2 MB altında olmalı, `slug` ve `sku` sütunları bulunmalı, her satırda fiyat olmalı. [İçe aktarma](/help/data#ice-aktarma).

**Müşterim verilerinin silinmesini istiyor.**
[Anonimleştirme](/help/customers-kvkk#kvkk-ve-anonimlestirme) kullanın; faturalar ayrı saklanır, hukukçunuza danışın.

**Trendyol stoğu ve fiyatı güncellenmiyor.**
Trendyol kartının etkin olduğunu ve anahtarların doğru olduğunu kontrol edin; arka plan işlerine **Entegrasyon olayları**'ndan bakın. [Trendyol](/help/integrations#trendyol).

**Deneme modunda mıyım, nasıl anlarım?**
Kenar çubuğunda **Mock gelen kutusu** görünüyorsa deneme modu açıktır. [Mock'u kapatma](/help/going-live#mock-u-kapatma).

**Yedeği nasıl alırım?**
[Yedekleme](/help/data#yedekleme).

**Çalışanımın neden bir sayfayı göremediğini anlayamıyorum.**
Rol yetkilerine bakın: [Kullanıcılar ve roller](/help/security#kullanicilar-ve-roller).

**Mağaza maliyetli mi olur?**
Çekirdek sistem küçük mağazalar için ücretsiz planlara sığacak biçimde tasarlanmıştır ancak bu bir garanti değildir. [Maliyetler](/help/going-live#maliyetler).

**Hâlâ çözemedim.**
Hata kodunu, saati ve **Denetim kaydı** / **Entegrasyon olayları** ekran görüntüsünü not edip destek isteyin; anahtar ve şifreleri asla paylaşmayın.

## Sık yapılan hatalar

* Hata mesajındaki kodu not etmeden kapatmak.
* Anahtarı yeniden girmeden "Bağlantıyı sına"ya tekrar tekrar basmak.
* Kilitlendiğinde art arda deneme yapmak; süre uzamaz ama kilit de açılmaz, bekleyin.
* Canlıda deneme modunu açmaya çalışmak.
* Başarısız arka plan işlerini incelemeden yeniden başlatmak.
