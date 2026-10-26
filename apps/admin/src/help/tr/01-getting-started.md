# Başlarken

Bu bölümde OpenShelf'in ne olduğunu, yönetim panelinin nasıl düzenlendiğini, ilk hesabı nasıl oluşturacağınızı, giriş yapıp hesabınızı iki adımlı doğrulamayla nasıl koruyacağınızı ve hiçbir dış hesap açmadan sistemi **deneme modunda** nasıl deneyeceğinizi öğrenirsiniz. Sonunda, mağazanızı gerçek müşteriye açmadan önce izleyeceğiniz 10 adımlık kısa bir yol haritası bulacaksınız.

Rehberin tamamını okumak zorunda değilsiniz. Her ekranın başındaki **Bu sayfa nasıl kullanılır?** düğmesi sizi doğrudan ilgili bölüme götürür; form alanlarının yanındaki **?** simgeleri ise o alanın ne olduğunu, örnek değerini ve dikkat etmeniz gereken noktayı kısaca anlatır.

![Yönetim paneli genel bakış ekranı](help/tr/dashboard.png)

## OpenShelf nedir, nasıl çalışır?

OpenShelf, küçük işletmeler için hazırlanmış açık kaynaklı bir e-ticaret sistemidir. Üç parçadan oluşur ve üçü de aynı adreste çalışır:

| Parça | Ne işe yarar | Adresi |
|---|---|---|
| **Vitrin** | Müşterilerin ürünlere baktığı, sepete eklediği ve ödeme yaptığı sitenizdir. | `https://magazaniz.com/` |
| **Yönetim paneli** | Ürünleri, siparişleri, faturaları ve ayarları yönettiğiniz bu ekrandır. Yalnızca sizin ve ekibinizin girişi vardır. | `https://magazaniz.com/admin/` |
| **Arka plan (API)** | Ekranların arkasında çalışan, siparişi kaydeden, stoğu düşen, ödemeyi doğrulayan bölümdür. Siz doğrudan görmezsiniz. | Otomatik |

Sistem bir sunucu kiralayıp bakımını yapmanızı gerektirmez. Cloudflare üzerinde, tek bir uygulama olarak çalışır; veriler Cloudflare'in veritabanı olan [D1](term:d1) içinde, uygulama kodu ise bir [Worker](term:worker) içinde durur. Alan adı, barındırma ve ücret konularını [Yayına geçiş](/help/going-live) bölümünde ayrıntılı bulabilirsiniz.

### Bir siparişin yolculuğu

Sistemin bütününü anlamak için tek bir siparişi baştan sona izleyelim. Örnek olarak müşterinin vitrinde **Seramik Vazo** (stok kodu `VAZO-S-KREM`) satın aldığını düşünelim:

1. Müşteri ürünü sepete ekler ve ödemeye geçer. Sistem o anda ürünü kısa süreliğine **ayırır** ([stok rezervasyonu](term:reservation)). Böylece aynı anda ödeme yapan başka biri, tek kalan vazoyu da satın alamaz.
2. Müşteri kart bilgilerini sizin sitenizde değil, ödeme kuruluşunun (iyzico) güvenli sayfasında girer. Kart bilgisi OpenShelf'e hiç ulaşmaz.
3. Ödeme başarılı olursa sipariş **Ödendi** durumuna geçer; ayrılan stok kalıcı olarak düşülür ve sipariş stok defterine "satış" olarak yazılır.
4. Sistem arka planda şunları kuyruğa alır: müşteriye "Siparişiniz alındı" e-postası/SMS'i, size "Yeni sipariş" bildirimi, e-Fatura/e-Arşiv faturası (e-Faturam açıksa), reklam ölçümü olayları (Meta/GA4 açıksa).
5. Siz siparişi hazırlar, kargo etiketi oluşturur ve durumu **Kargoya verildi** yaparsınız; müşteri takip numarasıyla birlikte bilgilendirilir.
6. Teslim edilince durumu **Teslim edildi** yaparsınız. İade gerekirse **İade** işlemini sipariş sayfasından yaparsınız.

Bu zincirin her halkası, bu rehberin bir bölümüne karşılık gelir. Ayrıntılar için [Siparişler](/help/orders#siparis-durumlari), [Faturalar](/help/invoices#otomatik-fatura) ve [Entegrasyonlar](/help/integrations#entegrasyonlari-test-etme) bölümlerine bakın.

> [!NOTE]
> Kuyruğa alınan işler ([outbox](term:outbox)) hemen çalışmayabilir; sistem bunları her dakika kontrol eder. Bir sağlayıcı geçici olarak yanıt vermezse iş daha uzun aralıklarla birkaç kez yeniden denenir. Yavaş bir SMS sağlayıcısı müşterinizin ödemesini asla bekletmez. Takılan işleri **Entegrasyon olayları** ekranından görebilirsiniz.

## Yönetim panelini tanıyın

Sol menü üç gruba ayrılır. Ekranınızın genişliği azsa menü, sol üstteki düğmenin arkasında gizlenir.

| Grup | Menü öğesi | Ne için kullanılır |
|---|---|---|
| **Mağaza** | **Genel bakış** | Günlük/haftalık satış, durumlara göre sipariş sayısı, azalan stok, entegrasyon sağlığı |
| | **Siparişler** | Siparişleri listeleme, ayrıntı, durum değiştirme, iade, kargo, yazdırma |
| | **Faturalar** | Elle fatura hazırlama, kesme ve iptal |
| | **E-postalar** | Panelden müşteriye e-posta yazma ve gönderilenler kaydı |
| | **Ürünler**, **Kategoriler**, **Kuponlar** | Katalog yönetimi |
| | **Müşteriler** | Müşteri kayıtları, KVKK anonimleştirme |
| **Yapılandırma** | **Entegrasyonlar** | iyzico, Trendyol, Geliver, e-Faturam, Meta, GA4, Netgsm, Twilio, Cloudflare E-posta bağlantıları |
| | **Mağaza ayarları** | Genel, Marka, SEO, Yasal metinler, Ödeme ve sipariş, Takip ve reklam, Bildirimler, Sistem |
| **Yönetim** | **Kullanıcılar ve güvenlik** | Parolanız, iki adımlı doğrulama, oturumlar, kullanıcı ekleme |
| | **Denetim kaydı** | Kimin neyi ne zaman değiştirdiği |
| | **Veri aktarımı** | Dışa/içe aktarma, yedekleme |
| | **Yardım ve rehber** | Bu rehber |

Deneme modu açıksa menüde ayrıca **Mock gelen kutusu** ve sorun gidermek için **Entegrasyon olayları** öğeleri görünür.

### Üç farklı rol

Her kullanıcının bir rolü vardır ve rol, hangi düğmelerin çalışacağını belirler:

| Rol | Neler yapabilir |
|---|---|
| **Mağaza sahibi** | Her şey. Deneme modunu açıp kapatabilen, kullanıcı ekleyip çıkarabilen tek roldür. |
| **Yönetici** | Ürün, sipariş, iade, fatura kesme, e-posta gönderme, entegrasyon ayarlama. Kullanıcı yönetimi ve deneme modu hariç. |
| **Personel** | Görüntüleme, sipariş durumu değiştirme, kargo oluşturma, stok düzeltme, yazdırma. İade, fatura kesme ve e-posta gönderme yapamaz (bu düğmeler pasif görünür ve üzerine gelince nedeni yazar). |

Rol dağılımını [Güvenlik](/help/security#kullanicilar-ve-roller) bölümünde bulabilirsiniz.

## İlk kurulum

OpenShelf'i ilk kez kurduğunuzda henüz hiçbir yönetici hesabı yoktur. Hesabı herkesin açabilmesi tehlikeli olacağı için sistem, kurulum sırasında size verilen **tek kullanımlık kurulum anahtarını** (`SETUP_TOKEN`) ister. Bu anahtarı bilen kişi, mağazanın sahibi olur.

1. Kurulum sırasında (Deploy düğmesi veya kurulum betiği) üretilen `SETUP_TOKEN` değerini bulun. Betik bunu **yalnızca bir kez** ekrana yazar; kaydetmez. Yerel denemede bu değer `workers/api/.dev.vars` dosyasındadır.
2. Tarayıcıdan `https://magazaniz.com/admin/setup` adresini açın (deneme için `https://<worker-adiniz>.workers.dev/admin/setup`).
3. Karşınıza **OpenShelf'e hoş geldiniz** ekranı çıkar. Alanları doldurun:

| Alan | Ne yazılır | Örnek | Dikkat |
|---|---|---|---|
| **Kurulum anahtarı** | Kurulumda üretilen `SETUP_TOKEN` | `3f9a…` (48 karakter) | Boşluk kopyalamayın. Yanlışsa "Geçersiz kurulum anahtarı" hatası alırsınız. |
| **Ad** | Adınız soyadınız | Ayşe Yılmaz | Denetim kaydında bu ad görünür. |
| **E-posta** | Giriş için kullanacağınız adres | ayse@magazaniz.com | Gerçekten erişebildiğiniz bir adres olsun. |
| **Parola** | En az 12 karakter | uzun bir cümle | Kısa ve tahmin edilebilir parola kullanmayın. |
| **Parolayı doğrula** | Aynı parola | | İkisi aynı olmalıdır. |

4. **Sahip hesabı oluştur** düğmesine tıklayın. Giriş ekranına yönlendirilirsiniz.

Kurulum anahtarı tek kullanımlıktır: ilk yönetici oluşturulduğu anda kurulum adresi kilitlenir ve bir daha kullanılamaz. Birisi sonradan `/admin/setup` adresini açsa bile giriş ekranına yönlendirilir.

> [!WARNING]
> Kurulum anahtarını yönetici hesabını oluşturduktan sonra paylaşmayın ve e-postayla göndermeyin. Hesap oluşturulmadan önce anahtarı kaybettiyseniz, Cloudflare panelinde veya `npx wrangler secret put SETUP_TOKEN` komutuyla yeni bir tane tanımlayabilirsiniz.

### Sık yapılan hatalar (kurulum)

- **"Kurulum devre dışı" (SETUP_TOKEN tanımlı değil) hatası:** Worker'da `SETUP_TOKEN` gizli değişkeni yoktur. Kurulum rehberindeki adımı tamamlayıp yeniden dağıtın.
- **Yanlış anahtar:** Kısa sürede çok sayıda deneme yaparsanız bir süre bekletilirsiniz (15 dakikada en fazla 5 deneme). 15 dakika sonra tekrar deneyin.
- **"Yapılandırma hatası (503)":** Şifreleme anahtarı (`APP_ENCRYPTION_KEY`) eksik veya hatalıdır. Bu anahtar sağlayıcı şifrelerinizi korur; kurulum rehberindeki komutla oluşturup tanımlayın.
- **Parola 12 karakterden kısa:** Form sizi uyarır; daha uzun bir parola yazın.

## İlk giriş

1. `https://magazaniz.com/admin/` adresini açın. Giriş ekranı gelir.
2. **E-posta** ve **Parola** alanlarını doldurup **Giriş yap** düğmesine tıklayın.
3. Hesabınızda [iki adımlı doğrulama](term:totp) açıksa ekran **İki adımlı doğrulama kodu** istemeye döner. Telefonunuzdaki doğrulayıcı uygulamadaki 6 haneli kodu yazıp **Doğrula**'ya tıklayın.

![Giriş ekranı](help/tr/login.png)

Aynı e-posta ile 15 dakika içinde 5 kez yanlış parola girerseniz "Çok fazla başarısız deneme. Daha sonra tekrar deneyin." iletisini görürsünüz. Bu bir güvenlik önlemidir: başkasının sizin parolanızı tahmin etmesini engeller. Bir süre bekleyin ve doğru bilgilerle yeniden deneyin. Kilit, e-posta ve bağlandığınız adres birlikte değerlendirilerek uygulanır; yani başka biri uzaktan deneme yaparak sizi kendi bilgisayarınızdan kilitleyemez.

Giriş yaptıktan sonra **Genel bakış** ekranına gelirsiniz. Oturumlar belirli bir süre sonra sona erer; o zaman yeniden giriş yapmanız gerekir. Açık oturumlarınızı **Kullanıcılar ve güvenlik** sayfasında görebilirsiniz.

> [!TIP]
> Giriş sorunları için [Sorun giderme](/help/troubleshooting#giris-sorunlari) bölümüne bakın.

## İki adımlı doğrulama

Parolanız çalınsa bile hesabınıza girilememesi için **iki adımlı doğrulama** (TOTP) kullanın. Giriş sırasında parolaya ek olarak, telefonunuzdaki bir uygulamanın her 30 saniyede bir ürettiği 6 haneli kod istenir.

Mağaza sahibi ve yönetici rollerinde, doğrulamayı henüz açmadıysanız ekranın üstünde sarı bir uyarı çubuğu çıkar: "Rolünüz için iki adımlı doğrulama gerekir. Güvenlik sayfasından iki adımlı doğrulamayı kurun." Bu çubuk, doğrulamayı açana kadar kapatılamaz. Doğrulama olmadan da paneli kullanabilirsiniz, fakat bu **güçlü biçimde önerilir**: panelde ödeme iadesi, fatura kesme ve müşteri verisi gibi geri alınamaz işlemler vardır.

### Doğrulamayı açma

1. Telefonunuza bir doğrulayıcı uygulaması kurun (Google Authenticator, Microsoft Authenticator, Authy, 1Password gibi).
2. Sol menüden **Kullanıcılar ve güvenlik**'e tıklayın.
3. **İki adımlı doğrulama (TOTP)** kartında **2 adımlı doğrulamayı kur** düğmesine tıklayın. Ekranda bir QR kod ve metin olarak bir anahtar gösterilir.
4. Uygulamanızda "hesap ekle / QR kod tara" seçeneğiyle kodu okutun (QR okutamıyorsanız anahtarı elle girin).
5. Uygulamada görünen 6 haneli kodu **Kod** alanına yazıp **Etkinleştir**'e tıklayın.
6. Doğrulama açıldı. Bir sonraki girişinizde kod sorulur.

![Güvenlik sayfası](help/tr/security.png)

> [!WARNING]
> Telefonunuzu kaybeder ya da doğrulayıcı uygulamayı silerseniz kod üretemezsiniz. Panelde bir kullanıcının doğrulamasını sıfırlayan bir düğme yoktur. Bir **yönetici** için çözüm, **mağaza sahibinin** o kullanıcıyı **Kullanıcılar ve güvenlik** sayfasından silip yeniden oluşturmasıdır. **Mağaza sahibi** kendi doğrulamasını kaybederse yalnızca veritabanı üzerinden kurtarma yapılabilir. Bu yüzden ikinci bir yönetici hesabı açmanızı ve doğrulayıcı uygulamanızın yedeğini (örneğin parola yöneticinizde) saklamanızı öneririz. Doğrulamayı kapatmak için de parolanız ve geçerli bir kod gerekir.

Ayrıntılar ve diğer güvenlik özellikleri için [Güvenlik](/help/security#iki-adimli-dogrulama) bölümüne bakın.

## Deneme modu

Deneme modu (kısaca **Mock modu**), mağazanızı **hiçbir dış hesap açmadan** denemenizi sağlar. Ödeme kuruluşu, kargo, fatura, SMS ve e-posta hesabınız olmasa bile siparişin baştan sona nasıl ilerlediğini görebilirsiniz. Müşteri sunumu, eğitim ya da ilk keşif için idealdir.

Deneme modunda dış servislerin hepsi çevrimdışı birer taklitle değiştirilir:

| Alan | Deneme modunda ne olur |
|---|---|
| Ödeme | Müşteri gerçek iyzico sayfası yerine, `/mock/pay/…` adresinde sahte bir ödeme sayfasına yönlenir. Sayfada **Başarılı**, **Başarısız** ve **İptal** düğmeleri vardır. Hiçbir kart çekilmez. |
| SMS ve e-posta | Hiçbir yere gönderilmez; **Mock gelen kutusu**'na kaydedilir. |
| Fatura ve kargo etiketi | Örnek PDF üretilir ve Mock gelen kutusuna kaydedilir. Vergi idaresine hiçbir şey gitmez. |
| Reklam ve analitik olayları | Gönderilmez, Mock gelen kutusuna yazılır. |
| Entegrasyon formları | Gerçekleriyle aynı alanları gösterir ama gerçek anahtar gerektirmez; girdiğiniz anahtarlar yok sayılır. |

Deneme modunda ödenen siparişler **DENEME** rozetiyle işaretlenir ve **Genel bakış**'taki gerçek ciroya dahil edilmez (ayrıca "hariç" olarak gösterilir).

### Açma adımları

1. Yayındaki Worker'da `ALLOW_MOCK` değişkenini `true` yapın. Cloudflare panelinde: **Workers** → Worker'ınız → **Settings** → **Variables and Secrets**. Yerel denemede bu değişken zaten tanımlıdır. Bu adım, mağazanızı korumak için bilerek zorunlu tutulur: yayındaki bir Worker `ALLOW_MOCK` olmadan deneme modunu açmayı reddeder.
2. **Mağaza sahibi** olarak giriş yapın.
3. **Mağaza ayarları** → **Sistem** sekmesine gidin.
4. **Deneme (mock) modu** anahtarını açın ve açılan onay penceresini onaylayın.
5. Sol menüde **Mock gelen kutusu** öğesi belirir.

![Sistem ayarları ve Mock modu anahtarı](help/tr/settings-system.png)

### Deneme modunun güvenlik kuralları

Bu kurallar sistem tarafından uygulanır; atlatılamaz:

- `ALLOW_MOCK` tanımlı değilse açılamaz.
- **Gerçek bir ödeme sağlayıcısı (iyzico) açıkken** açılamaz. Önce **Entegrasyonlar** ekranından iyzico'yu kapatmanız gerekir.
- **Gerçek ödenmiş, hazırlanan veya kargolanmış siparişler varken** açılamaz. Önce bunları teslim edin ya da tamamlayın.
- Yalnızca **mağaza sahibi** açıp kapatabilir. Her açma/kapama **Denetim kaydı**'na yazılır.
- Mock gelen kutusu en fazla 7 gün ve 2000 kayıt tutar; mağaza sahibi temizleyebilir.
- Deneme modunda ödenmiş bir sipariş, mod kapalıyken iade edilemez (ve tersi). Ayrıntı için [İade](/help/orders#iade) bölümüne bakın.

> [!DANGER]
> Gerçek müşterilerle çalışan bir mağazada deneme modunu **asla** açmayın. Müşteriler sahte ödeme sayfasına yönlenir, kimse gerçekten ödeme yapmaz, ama sipariş oluşur. Mod açıkken "Gerçek anahtarlar yok sayılır" olduğu için, unutursanız satışlarınız sessizce para getirmez.

### Demo turu (10 dakika)

1. **Mağaza ayarları → Bildirimler** sekmesinde "Sipariş ödendi" satırında e-posta kutusunu işaretleyin.
2. Vitrini açın, **Seramik Vazo** ürününü sepete ekleyin ve ödemeye geçin (telefon numarasını `+90` ile başlayarak yazın).
3. Sahte ödeme sayfasında **Başarılı**'ya basın.
4. Yönetimde **Siparişler** sayfasına gidin; sipariş **Ödendi** durumunda ve **DENEME** rozetiyle görünür.
5. **Mock gelen kutusu**'nu açın: ödeme, e-posta ve (açıksa) fatura/kargo kayıtlarını görürsünüz. **Kanal** filtresiyle SMS, e-posta, olay, fatura, kargo ve ödeme kayıtlarını ayırabilirsiniz.

![Mock gelen kutusu](help/tr/mock-inbox.png)

### Deneme modunu kapatma

Gerçek satışa başlamadan önce **Sistem** sekmesinde anahtarı kapatın ve Cloudflare'den `ALLOW_MOCK` değişkenini silin. Kapatınca gerçek entegrasyonlar kayıtlı anahtarlarla yeniden kullanılır; ödenmemiş deneme siparişleri artık tamamlanamaz. Kontrol listesi için [Yayına geçiş](/help/going-live#mock-u-kapatma) bölümüne bakın.

## İlk 10 adım

Yeni bir mağazayı gerçek müşteriye açmadan önce şu sırayı izleyin. Her adımın yanındaki bağlantı, ilgili bölüme götürür.

1. **Hesabınızı koruyun.** [İki adımlı doğrulamayı](/help/security#iki-adimli-dogrulama) açın; mümkünse ikinci bir yönetici hesabı oluşturun.
2. **Mağaza bilgilerini girin.** **Mağaza ayarları → Genel**: mağaza adı, iletişim e-postası/telefonu, adres, vergi numarası, para birimi, varsayılan KDV oranı. Bu bilgiler faturalarda ve e-postalarda görünür. → [Mağaza ayarları](/help/store-settings#genel)
3. **Markanızı oluşturun.** Logo, favicon, renkler, ana sayfa banner'ları. → [Marka](/help/store-settings#marka)
4. **Yasal metinleri yazın.** KVKK aydınlatma, mesafeli satış sözleşmesi, iade koşulları, çerez ve gizlilik metinleri. Hukuki danışmanlık almanız gerekir. → [Yasal metinler](/help/store-settings#yasal-metinler)
5. **Kategorileri ve ürünleri ekleyin.** Her ürüne fotoğraf, açıklama, stok kodu, fiyat ve stok girin; durumunu **Aktif** yapın. → [Katalog](/help/catalog#urun-ekleme)
6. **Ödeme ve sipariş kurallarını belirleyin.** Stok rezervasyon süresi, kargo ücreti, ücretsiz kargo eşiği. → [Ödeme ve sipariş](/help/store-settings#odeme-ve-siparis)
7. **iyzico'yu bağlayın** ve önce **Sandbox**'ta deneyin. → [iyzico](/help/integrations#iyzico)
8. **Diğer entegrasyonları bağlayın:** kargo (Geliver), fatura (e-Faturam), e-posta ve SMS. Her birinde **Bağlantıyı test et** düğmesini kullanın. → [Entegrasyonları test etme](/help/integrations#entegrasyonlari-test-etme)
9. **Bildirimleri ayarlayın** ve kendi adresinize bir test mesajı gönderin. → [Bildirimler](/help/store-settings#bildirimler)
10. **Bir deneme siparişi verin**: ödeme, kargo etiketi, fatura, iade adımlarını baştan sona deneyin; sonra deneme modunu kapatıp gerçek anahtarlara geçin. → [Yayına geçiş](/help/going-live#yayin-kontrol-listesi)

> [!TIP]
> **Genel bakış** ekranındaki **Entegrasyon sağlığı** kartı, hangi bağlantının çalıştığını ve hangisinin hata verdiğini tek bakışta gösterir. Her sabah bir göz atmak iyi bir alışkanlıktır.

## Rehber ve yardım nasıl kullanılır

- **Sayfa rehberi:** Her ekranın üstündeki **Bu sayfa nasıl kullanılır?** düğmesi, sağdan açılan bir panelde o ekranın rehber bölümünü gösterir.
- **"?" simgeleri:** Form alanlarının yanındadır. Ne olduğunu, örneğini ve uyarısını gösterir; "Rehberde oku" bağlantısı ilgili bölüme götürür.
- **Sözlük terimleri:** Altı çizili teknik terimlerin (örneğin [SKU](term:sku), [KDV](term:kdv), [webhook](term:webhook)) üzerine gelince tek satırlık açıklama görünür; tıklayınca ayrıntılı açıklama açılır.
- **Arama:** **Yardım ve rehber** sayfasındaki arama kutusu, bu bölümlerin tamamında arama yapar.

![Yardım ve rehber sayfası](help/tr/help-page.png)

## Sık yapılan hatalar

- **Kurulum anahtarını paylaşmak ya da saklamamak.** Anahtar yalnızca bir kez gösterilir; not alın, hesabı açtıktan sonra silin.
- **İki adımlı doğrulamayı ertelemek.** Sarı uyarı çubuğunu görmezden gelmeyin.
- **Deneme modunu canlıda açık bırakmak.** Satış yapıyor görünür ama para gelmez. Yayına geçmeden önce Sistem sekmesini kontrol edin.
- **Tek yönetici hesabıyla çalışmak.** Parolayı veya telefonu kaybederseniz kurtarmak zorlaşır. İkinci bir yönetici hesabı oluşturun.
- **Ayarları kaydetmeden başka sekmeye geçmek.** Ayar sekmelerinin altındaki kaydet çubuğunda **Kaydet** düğmesine basmadıkça değişiklikler uygulanmaz.
- **Yasal metinleri hazır şablonla bırakmak.** Şablonlar yalnızca başlangıç noktasıdır, hukuki danışmanlık değildir.
