# Güvenlik

Bu bölümde yönetim panelinizi başkalarının eline geçmekten nasıl koruyacağınızı öğreneceksiniz: güçlü şifre, iki adımlı doğrulama, ekip üyeleri ve rolleri, oturumların nasıl kapandığı, hatalı girişlerde ne olduğu, gizli anahtarların nasıl saklandığı ve denetim kaydından neleri izleyebileceğiniz. Hepsi **Kullanıcılar ve güvenlik** ve **Denetim kaydı** sayfalarındadır.

![Kullanıcılar ve güvenlik sayfası](help/tr/security.png)

Panelinizde müşteri bilgileri, siparişler ve para hareketleri vardır. Bu yüzden panel hesabınız bir e-posta hesabından daha değerlidir. İyi haber: en önemli korumalar (şifre ve iki adımlı doğrulama) beş dakikada kurulur.

> [!TIP]
> Güvenliğin %90'ı üç alışkanlıktır: uzun ve benzersiz bir şifre, iki adımlı doğrulama ve ekip üyelerine yalnızca ihtiyaç duydukları yetkiyi vermek.

## Şifre kuralları

* En az **12 karakter** olmalıdır (en çok 256).
* Başka hiçbir yerde kullanmadığınız bir şifre seçin. Üç-dört kelimeden oluşan bir cümle (`mavi-fincan-gece-yagmur`) uzun ve akılda kalıcıdır.
* Şifre yöneticisi (parola yöneticisi) kullanmanızı öneririz.
* Şifreniz sunucuda düz metin olarak saklanmaz; geri döndürülemez biçimde karıştırılarak (PBKDF2-SHA256 özeti) saklanır. Bu nedenle kimse, yönetici bile, şifrenizi göremez.

**Şifre değiştirmek için:** **Kullanıcılar ve güvenlik → Şifreyi değiştir** bölümünde mevcut şifrenizi, sonra iki kez yeni şifrenizi yazın. Şifre değişince **diğer tüm cihazlardaki oturumlarınız kapanır**; bulunduğunuz oturum açık kalır.

> [!NOTE]
> Şifrenizi unutursanız panelde "şifremi unuttum" bağlantısı yoktur. Mağaza sahibi sizin için yeni geçici şifre belirleyebilir (aşağıdaki [Kullanıcılar ve roller](#kullanicilar-ve-roller) bölümü). Tek hesap mağaza sahibiyse ve şifre unutulduysa kurtarma için teknik müdahale gerekir; bu yüzden şifrenizi güvenli bir yerde saklayın.

## İki adımlı doğrulama

[İki adımlı doğrulama (TOTP)](term:totp), şifreniz çalınsa bile hesabınıza girilmesini engeller. Girişte şifrenizin yanında telefonunuzdaki uygulamanın ürettiği, 30 saniyede bir değişen 6 haneli kodu da yazarsınız.

**Kimler için zorunlu?** Mağaza sahibi ve yönetici hesapları için iki adımlı doğrulama kurmak zorunludur; personel için isteğe bağlıdır. Henüz kurmadıysanız panel sizi kurmaya yönlendirir.

### Kurulum

**Başlamadan önce:** Telefonunuza bir doğrulama uygulaması yükleyin (Google Authenticator, Microsoft Authenticator, Authy veya 1Password gibi). Hangisini kullanırsanız kullanın çalışır.

1. **Kullanıcılar ve güvenlik → İki adımlı doğrulama (TOTP)** kartında **2FA'yı kur** düğmesine basın.
2. Ekranda bir **QR kodu** belirir. Telefondaki uygulamayla bu kodu tarayın.
3. QR'ı tarayamıyorsanız **Tarayamıyor musunuz? Anahtarı elle girin** bağlantısına tıklayın; görünen anahtarı uygulamaya elle yazın.
4. Uygulamada "OpenShelf" adlı yeni bir kayıt oluşur ve 6 haneli kod göstermeye başlar.
5. Bu kodu **Kod** alanına yazın ve **Etkinleştir**'e basın.
6. Kartta **Etkin** rozetini görürsünüz.

Bundan sonra her girişte şifrenizden sonra bu kod istenir.

### Giriş yaparken

1. E-posta ve şifrenizi yazıp giriş yapın.
2. "İki adımlı kod" ekranı çıkar; uygulamadaki 6 haneli kodu girin.
3. Kod yanlışsa veya süresi geçmişse yenisini bekleyin. **Aynı kod ikinci kez kullanılamaz**; kod bir kez kabul edildikten sonra aynı kodla tekrar giriş yapılmaz.

### Telefonu kaybederseniz

> [!DANGER]
> OpenShelf'te **kurtarma kodu yoktur**. Telefonunuzu kaybeder ve uygulamadaki kaydı yedeklemediyseniz iki adımlı doğrulamayı panelden kendiniz sıfırlayamazsınız. Telefonunuzdan önce kurulumda gösterilen **anahtarı** (QR'ın altındaki yazılı kod) güvenli bir yere not edin. Bu anahtarla yeni telefona aynı doğrulamayı yeniden ekleyebilirsiniz. Anahtarı kimseyle paylaşmayın.

İkinci bir mağaza sahibi veya yönetici hesabı açmak, biri kilitlendiğinde panele girmeye devam etmenizi sağlar; ancak bir başkasının iki adımlı doğrulamasını sıfırlamak için panelde bir düğme bulunmuyor. Bu durumda teknik bir müdahale gerekir (doğrulanmadı: veritabanında ilgili alanların temizlenmesi). Bu yüzden anahtarı yedeklemek en güvenli yoldur.

### Kapatma

**Kullanıcılar ve güvenlik → İki adımlı doğrulamayı kapat** için **şifrenizi** ve güncel **doğrulama kodunu** yazmanız gerekir. Mağaza sahibi veya yönetici iseniz kapatmanız önerilmez; panel sizi yeniden kurmaya yönlendirir.

## Kullanıcılar ve roller

Panele birden fazla kişi girebilir. Her kişinin kendi e-postası ve şifresi olur; kimse şifre paylaşmamalıdır. Üç rol vardır:

| Rol | Ne için | Kısaca yetkisi |
|---|---|---|
| **Mağaza sahibi** | Mağazanın sahibi | Her şey, ayrıca ekip yönetimi ve deneme modu |
| **Yönetici** | Güvenilir kıdemli çalışan | Mağazayı yönetme; ekip yönetimi ve deneme modu hariç |
| **Personel** | Günlük sipariş işleri yapan çalışan | Görüntüleme ve temel sipariş işlemleri |

### Ayrıntılı yetki tablosu

| İşlem | Personel | Yönetici | Mağaza sahibi |
|---|---|---|---|
| Genel bakış, siparişler, ürünler, müşteriler, kuponlar, kategoriler, faturalar, e-postalar listelerini görmek | Evet | Evet | Evet |
| Ayarları görüntülemek (gizli anahtarlar hiçbir zaman gösterilmez) | Evet | Evet | Evet |
| Sipariş durumunu değiştirmek, kargo oluşturmak, siparişten fatura kesmeyi başlatmak | Evet | Evet | Evet |
| Stok düzeltmek | Evet | Evet | Evet |
| Ürün, kategori, kupon eklemek/düzenlemek/silmek | Hayır | Evet | Evet |
| İade yapmak | Hayır | Evet | Evet |
| Elle fatura oluşturmak, kesmek, iptal etmek | Hayır | Evet | Evet |
| E-posta göndermek | Hayır | Evet | Evet |
| Mağaza ayarlarını değiştirmek | Hayır | Evet | Evet |
| Entegrasyonları görmek, düzenlemek, sınamak | Hayır | Evet | Evet |
| Entegrasyon olayları, sıra durumu ve pazarlama olayları | Hayır | Evet | Evet |
| Müşteriyi anonimleştirmek | Hayır | Evet | Evet |
| Veri dışa/içe aktarmak | Hayır | Evet | Evet |
| Denetim kaydını okumak | Hayır | Evet | Evet |
| Mock gelen kutusunu görmek | Hayır | Evet | Evet |
| Kullanıcı eklemek, rol değiştirmek, silmek | Hayır | Hayır | Evet |
| Deneme modunu açıp kapatmak, Mock gelen kutusunu temizlemek | Hayır | Hayır | Evet |

### Ekip üyesi ekleme

Bu işlemi yalnızca **mağaza sahibi** yapabilir.

1. **Kullanıcılar ve güvenlik → Yönetici kullanıcılar** kartını açın.
2. **Yönetici kullanıcı ekle**'ye basın.
3. E-posta, ad, **Rol** ve **Geçici şifre** yazın (en az 12 karakter).
4. Kaydedin ve geçici şifreyi güvenli bir kanaldan kişiye iletin; ilk girişte şifresini değiştirmesini söyleyin.
5. Yönetici veya sahip eklediyseniz kişiye iki adımlı doğrulamayı kurmasını hatırlatın.

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| E-posta | Kişinin kendi iş e-postası | `ayse@magazaniz.com` | Aynı e-posta ikinci kez kullanılamaz |
| Ad | Görünen ad | Ayşe Yılmaz | Denetim kaydında bu ad görünür |
| Rol | Personel / Yönetici / Mağaza sahibi | Personel | Gereğinden fazla yetki vermeyin |
| Geçici şifre | En az 12 karakter | (güçlü bir şifre) | Mesaj uygulamalarında paylaşmaktan kaçının; ilk girişte değiştirtin |

### Rol değiştirme, devre dışı bırakma, silme

* Bir kullanıcının rolünü, şifresini değiştirdiğinizde veya devre dışı bıraktığınızda **o kullanıcının açık tüm oturumları kapanır**.
* **Kendinizi** silemez, devre dışı bırakamaz veya rolünüzü düşüremezsiniz.
* Sistemde **en az bir etkin mağaza sahibi** kalmalıdır; son sahibi silemez veya düşüremezsiniz.
* İşten ayrılan kişinin hesabını hemen devre dışı bırakın veya silin. Geçmiş işlemleri denetim kaydında kalır.

> [!WARNING]
> Kimseye gereğinden fazla yetki vermeyin. Bir çalışan yalnızca siparişlerle ilgileniyorsa **Personel** rolü yeterlidir. Yönetici rolü iade, ayar ve entegrasyon anahtarlarını değiştirme yetkisi taşır.

## Oturumlar

Giriş yaptığınızda tarayıcınıza bir **oturum** tanımlanır; bu sayede her tıklamada yeniden şifre yazmazsınız. [Oturum](term:session) süreleri:

| Kural | Süre |
|---|---|
| Hareketsiz kalırsanız oturum kapanır | 2 saat |
| Girişten itibaren mutlak süre | 12 saat |

Oturum kapandığında tekrar giriş yapmanız istenir; yarım kalan bir formu kaydetmeden beklediyseniz kaybolabilir.

**Her yerden çıkış:** Ortak bir bilgisayarda çalıştıysanız, telefonunuzu kaybettiyseniz veya hesabınızdan şüpheleniyorsanız **Kullanıcılar ve güvenlik → Oturumlar → Her yerden çıkış yap**'a basın. Bu işlem bulunduğunuz oturum dahil **tüm cihazlardaki** oturumları sonlandırır ve sizi giriş sayfasına yollar. Ardından şifrenizi değiştirin.

Teknik olarak oturum anahtarı rastgele üretilir, veritabanında yalnızca özeti saklanır ve çerez yalnızca HTTPS ile çalışır, sayfa betikleri tarafından okunamaz. Bu yüzden yönetim paneli adresini yalnızca `https://` ile açın ve yayında bağlantının kilit simgesi gösterdiğini doğrulayın ([SSL / HTTPS](term:ssl)).

### Çapraz site koruması

Paneldeki her değiştirme işlemi (kaydet, sil, iade et gibi) iki ek kontrolden geçer: isteğin doğru siteden (panel adresinizden) geldiği ve oturumunuza özel gizli bir [CSRF](term:csrf) jetonunun eşleştiği. Başka bir sitedeki kötü niyetli bir sayfa, siz girişliyken sizin adınıza işlem yaptıramaz. Bunu siz yönetmezsiniz; ancak sık görülen bir sonucu vardır: panel adresini sonradan "sabitlediyseniz" ve farklı bir adresten giriş yapıyorsanız "Origin not allowed" benzeri bir hata alırsınız ([Sorun giderme](/help/troubleshooting#giris-sorunlari)).

## Denetim kaydı

[Denetim kaydı](term:auditlog), panelde yapılan her değiştirme işlemini kimin, ne zaman yaptığını gösteren günlüktür. **Denetim kaydı** sayfasında bulunur (yönetici ve mağaza sahibi görür).

![Denetim kaydı](help/tr/audit.png)

| Sütun | Ne gösterir |
|---|---|
| **Zaman** | İşlemin tarihi ve saati |
| **Kullanıcı** | İşlemi yapan kişi |
| **İşlem** | Ne yapıldı (aşağıdaki liste) |
| **Kayıt** | Hangi kayıt etkilendi (ürün, sipariş, müşteri gibi) |

Kaydedilen başlıca işlemler:

* Giriş yapma, tüm yerlerden çıkış, şifre değiştirme, iki adımlı doğrulamayı açma/kapama
* Kullanıcı ekleme, güncelleme, silme
* Ürün, kategori, kupon oluşturma/güncelleme/silme/arşivleme
* Sipariş durumu değişikliği, kargo, fatura isteği, iade (başarılı ve başarısız)
* Elle fatura oluşturma/güncelleme/kesme/iptal/silme
* Stok düzeltme
* Ayar ve entegrasyon güncelleme, entegrasyon testi
* E-posta gönderme, test bildirimi
* Dışa aktarma, ürün içe aktarma
* Müşteri anonimleştirme
* Görsel yükleme/silme
* Deneme modunu açma/kapama ve Mock gelen kutusunu temizleme
* Kurulumun tamamlanması

Denetim kaydı şu durumlarda işinize yarar:

* "Bu ürünün fiyatını kim değiştirdi?"
* "Bu iadeyi kim başlattı?"
* "Dün gece panele kim girdi?" ve tanımadığınız bir giriş var mı?
* Bir çalışanın yaptığı işlemleri sonradan incelemek.

Kayıtlara şifre ve gizli anahtar gibi değerler **yazılmaz**; bu alanlar gizlenir. Kayıtlar panelden silinemez veya düzenlenemez. Denetim kaydı yalnızca değiştirme işlemlerini tutar; sayfalara bakmak kaydedilmez.

> [!TIP]
> Haftada bir denetim kaydına göz atın. Tanımadığınız bir giriş veya beklenmedik bir işlem görürseniz hemen **Her yerden çıkış yap**'ı kullanın ve şifreleri değiştirin.

## Kilitlenme

Birisi şifrenizi tahmin etmeye çalışırsa sistem kendini korur. [İstek sınırı (rate limit)](term:ratelimit) ve kilitlenme kuralları şöyle çalışır:

| Durum | Ne olur |
|---|---|
| Aynı e-posta ve aynı IP adresinden 15 dakikada **5** hatalı giriş | O e-posta + IP çifti 15 dakika kilitlenir |
| Aynı IP adresinden 15 dakikada **20** hatalı giriş (hangi e-posta olursa olsun) | O IP adresi 15 dakika kilitlenir |
| Aynı IP'den 3 veya aynı e-postaya 5 hatalı deneme | (Robot doğrulaması kurulduysa) ek bir [Turnstile](term:turnstile) doğrulaması istenir |
| Aynı IP adresinden 15 dakikada 20'den fazla giriş isteği | "Çok fazla istek" uyarısı; kısa süre bekleyin |

Kilitlenme **e-posta ve IP birlikte** hesaba katıldığı için, uzaktaki biri sizin e-postanızla sürekli hatalı deneme yaparak sizi kendi bilgisayarınızdan dışarıda bırakamaz: o saldırgan kendi IP adresinden kilitlenir, siz yine girebilirsiniz.

Yanlış e-posta ve yanlış şifre için aynı genel hata gösterilir; sistem bir hesabın var olup olmadığını belli etmez. Kilitlendiyseniz "çok fazla hatalı deneme, daha sonra tekrar deneyin" anlamında bir uyarı görürsünüz. Bekleme süresi 15 dakikadır.

Kilit açılmazsa ve emin olmadığınız bir durum varsa:

1. 15 dakika bekleyin; bu süre sonunda kilit kendiliğinden kalkar.
2. Şifrenizin doğru olduğundan emin olun (büyük/küçük harf, klavye dili, boşluk).
3. İki adımlı kodunuzu telefonun saatinin doğru olduğundan emin olarak girin.
4. Hâlâ girmiyorsa mağaza sahibinden yeni geçici şifre isteyin.

Ayrıntılı çözümler: [Giriş sorunları](/help/troubleshooting#giris-sorunlari).

Başarısız ve başarılı tüm girişler veritabanında e-posta ve IP ile kaydedilir; eski kayıtlar kilit hesabına girmez (yalnızca son 15 dakika sayılır).

## Gizli anahtarlar

Entegrasyon anahtarları (iyzico [API anahtarı](term:apikey), Trendyol sırrı, Meta [erişim jetonu](term:accesstoken) gibi) panelin en hassas bilgileridir. Bir kişi bu anahtarları ele geçirirse hesabınız adına işlem yapabilir.

OpenShelf bunları şöyle korur:

* **Şifreli saklanır.** Anahtarlar veritabanına şifrelenmiş olarak yazılır ([şifreleme](term:encryption)); şifreyi çözen ana anahtar (`APP_ENCRYPTION_KEY`) Cloudflare'in gizli depolama alanındadır, veritabanında değildir.
* **Bir daha gösterilmez.** Anahtarı kaydettikten sonra alan yalnızca "kayıtlı" gibi maskeli görünür ([gizli anahtar](term:secret) alanları "yalnızca yazılır"dır). Değiştirmek için yenisini yazarsınız.
* **Tarayıcıya hiç gönderilmez.** Ne vitrin ne yönetim paneli anahtarı görür.
* **Kayıtlara yazılmaz.** Günlüklerden ve hata mesajlarından anahtarlar temizlenir.
* **Yalnızca sunucudan kullanılır.** Her sağlayıcıya yalnızca belirli, önceden tanımlı adreslerle bağlanılır.

### Sizin yapmanız gerekenler

* Anahtarları e-postayla, mesajla veya ekran görüntüsüyle paylaşmayın.
* Bir anahtarın sızdığından şüpheleniyorsanız **önce sağlayıcının panelinden iptal edip yenisini üretin**, sonra OpenShelf'e yenisini yazın.
* Ana şifreleme anahtarını (`APP_ENCRYPTION_KEY`) bir yere not edin ve güvenle saklayın. Kaybederseniz entegrasyon anahtarlarının şifresi çözülemez; sipariş ve müşteri verisi etkilenmez ama her entegrasyonun anahtarını yeniden girmeniz gerekir. Anahtarı değiştirme (rotasyon) işlemi teknik bir süreçtir; adımları projenin `docs/security.md` dosyasında bulunur ve işlemden önce veri dışa aktarmanız önerilir.
* Cloudflare hesabınızı da iki adımlı doğrulamayla koruyun ve hesaba erişimi olan kişi sayısını azaltın. OpenShelf'in kapsamı Cloudflare hesabınızın ele geçirilmesini kapsamaz.
* `SETUP_TOKEN` (ilk kurulumda sahip hesabı oluşturan tek kullanımlık anahtar) kullanıldıktan sonra tekrar kullanılamaz; yine de not ettiğiniz kopyayı silin.

### Yapılandırma dışa aktarmasında gizli anahtarlar

**Veri aktarımı** sayfasındaki yapılandırma yedeği gizli anahtarları **içermez**. Bu yüzden yedekten geri yüklerseniz anahtarları yeniden girersiniz; bkz. [Veri aktarımı ve yedek](/help/data#disa-aktarma).

## Diğer koruma önlemleri (kısaca)

| Tehdit | Koruma |
|---|---|
| Sahte ödeme bildirimi | Bildirimin imzası doğrulanır, sağlayıcıdan yeniden sorgulanır, tutar ve sipariş eşleşmesi kontrol edilir |
| Çifte işlem, fazla satış | Stok rezervasyonları ve tekrarlanan işlemi önleme ([idempotency](term:idempotency)) |
| Kart verisi sızıntısı | Kart bilgisi OpenShelf'e hiç ulaşmaz |
| Zararlı dosya yükleme | Yalnızca png, jpeg, webp, gif ve avif görsellere izin verilir; SVG reddedilir; dosya içeriği kontrol edilir |
| Aşırı istek ve robot kötüye kullanımı | Giriş, ödeme, kupon, arama gibi yerlerde istek sınırları; isteğe bağlı robot doğrulaması |

## Güvenlik kontrol listesi

1. Şifreniz en az 12 karakter, benzersiz ve bir şifre yöneticisinde.
2. İki adımlı doğrulama açık ve anahtar yedeklendi.
3. Her ekip üyesinin kendi hesabı ve en düşük yeterli rolü var.
4. Ayrılan çalışanların hesapları devre dışı.
5. Haftada bir denetim kaydı kontrol ediliyor.
6. Anahtarlar kimseyle paylaşılmıyor; sızarsa önce sağlayıcıda iptal ediliyor.
7. Cloudflare hesabı da iki adımlı doğrulamalı.

## Sık yapılan hatalar

* **Tek bir ortak hesabı herkesle paylaşmak.** Kimin ne yaptığı denetim kaydında ayırt edilemez.
* **Personele yönetici rolü vermek.** Gereksiz yetki risk yaratır.
* **İki adımlı anahtarı yedeklememek.** Telefon kaybında hesaba girilemez.
* **Anahtarı sohbet uygulamasında paylaşmak.** Sızdıysa hemen sağlayıcıda iptal edin.
* **Ortak bilgisayarda "Her yerden çıkış yap" demeden bırakmak.**
* **Geçici şifreyi değiştirtmemek.**
