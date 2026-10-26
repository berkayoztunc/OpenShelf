# E-posta oluşturma

Bu bölümde panelden bir müşteriye (örneğin kargo gecikmesi, özür, fatura gönderimi için) kendi yazdığınız e-postayı nasıl göndereceğinizi öğrenirsiniz: yazma ekranı, hazır şablonlar, saatlik/günlük gönderim limitleri ve gönderilenler kaydı. Bu özellik sipariş durumuna göre **otomatik** giden bildirimlerden (bkz. [Bildirimler](/help/store-settings#bildirimler)) ayrıdır; burada tek tek, elle yazılan mesajlardan söz ediyoruz.

> [!NOTE]
> E-posta yazma özelliği **Beta** aşamasındaki Cloudflare E-posta hizmetine dayanır. Hizmetin kendisi, planınız ve davranışı değişebilir; canlı hesapla doğrulanmamıştır. Gerçek müşterilere yazmadan önce kendi adresinize bir deneme gönderin.

## E-posta yazma

Sol menüden **E-postalar**'a, sağ üstten **E-posta yaz**'ya tıklayın (ya da sipariş sayfasındaki **Müşteriye e-posta gönder**, kesilmiş faturadaki **Müşteriye e-posta gönder** düğmesiyle alıcı ve konu hazır gelir).

![E-posta yazma ekranı](help/tr/emails-compose.png)

> [!WARNING]
> E-posta **göndermek** yalnızca **yönetici** ve **mağaza sahibi** yetkisindedir. Personel rolü kayıtları görüntüleyebilir ama **Gönder** düğmesi pasiftir ("Yalnızca mağaza sahibi ve yöneticiler e-posta gönderebilir").

### Ön koşul

Gönderim için **Entegrasyonlar** ekranında **Cloudflare E-posta**'nın açık ve yapılandırılmış olması gerekir ([Cloudflare E-posta](/help/integrations#cloudflare-e-posta)). Yoksa "Etkin bir e-posta sağlayıcısı yok" hatası alırsınız. Deneme modunda e-postalar gerçekten gönderilmez; **Mock gelen kutusu**'na yazılır.

### Adım adım e-posta gönderme

1. **E-postalar** → **E-posta yaz**.
2. **Mesaj** kartında **Kime** alanına e-posta adresini yazın ya da en az 2 harf yazarak kayıtlı müşterilerden birini seçin. (Anonimleştirilmiş müşteriler listede çıkmaz.)
3. İsterseniz **Bilgi (Cc)** ve **Yanıt adresi** alanlarını doldurun. Yanıt adresi boşsa müşterinin yanıtı mağaza adresine gider.
4. **Konu**'yu yazın (en fazla 200 karakter, satır sonu içeremez; sayaç altında görünür).
5. **Gövde** alanına mesajı yazın. Biçim:
   - Boş satır bırakmak yeni paragraf açar.
   - `**kalın**` yazarsanız kalın görünür (ya da **Kalın** düğmesini kullanın).
   - Yalnızca `https://` ile başlayan bağlantılar tıklanabilir olur; **Bağlantı** düğmesi adres eklemenize yardım eder.
   - **`{{storeName}}`** düğmesi mağaza adınızı ekler.
   - HTML yazamazsınız; yazdığınız her şey düz metin olarak işlenir ve güvenli biçimde HTML'e çevrilir.
6. Sağdaki **Önizleme** kartında gerçek e-postayı görün. Önizleme ile gönderilen e-posta birebir aynıdır.
7. Gerekirse **Fatura bağlantısı ekle** listesinden kesilmiş bir manuel faturayı seçin: mesajın sonuna faturanın PDF bağlantısı eklenir.
8. Sağ üstteki **Gönder**'e basın, açılan **Bu e-posta gönderilsin mi?** penceresinde onaylayın.
9. Başarılıysa durum **Gönderildi** olur; **Gönderilenler** kaydına eklenir. Başarısız olursa hata gösterilir ve **Yeniden gönder** seçeneği sunulur.

**Gönder** düğmesi; alıcı, konu ve gövde geçerli olmadan ve çözülmemiş yer tutucu kalmadan aktif olmaz.

### Gönderen (From) neden değiştirilemez?

Gönderen adresi **yazma ekranında yoktur** ve değiştirilemez. Sistem şunları kullanır:

1. **Mağaza ayarları → Bildirimler → Gönderen e-posta** (yoksa)
2. **Mağaza ayarları → Genel → İletişim e-postası**.

Gönderen adı: **Bildirimler → Gönderen adı**, boşsa **Mağaza adı**. Bu bilinçli bir güvenlik kuralıdır: panel üzerinden başkasının adresiyle (sahte gönderici) e-posta gönderilemez. Gönderen alan adının Cloudflare Email Sending'de doğrulanmış olması şarttır; aksi halde sağlayıcı e-postayı reddeder.

### Hangi yer tutucular çalışır?

E-posta yazarken **yalnızca `{{storeName}}`** otomatik doldurulur. `{{orderNumber}}`, `{{customerName}}` gibi diğer şablon değişkenleri bu ekranda **doldurulmaz**; elle gerçek değerle değiştirmeniz gerekir. Çözülmemiş bir yer tutucu kalırsa:

- Önizleme sarı uyarı gösterir ("`{{orderNumber}}` yer tutucusu değiştirilmedi").
- Gönderim reddedilir ("Önce şu yer tutucuları değiştirin: `{{orderNumber}}`").

Bu kural, müşteriye yanlışlıkla "Sayın {{customerName}}" gibi bir mesajın gitmesini engeller.

### Sık yapılan hatalar

- **Şablonu uygulayıp yer tutucuları değiştirmemek.** Gönderim reddedilir; `{{…}}` ifadelerini elle yazın.
- **HTML yazmak:** HTML etiketleri düz metin olarak görünür.
- **Cloudflare Free planında herkese göndermeyi beklemek.** Free planda yalnızca doğrulanmış hedef adreslere teslim edilir; diğer adreslere gönderim sağlayıcı tarafından reddedilir.
- **Gönderen alan adını doğrulamamak.** Gönderim başarısız olur ve hata **Gönderilenler**'de yazar.
- **Konuya satır sonu koymak:** Konu tek satır olmalıdır.
- **Müşteri bilgilerini gereksiz paylaşmak.** Kişisel veri ([KVKK](term:kvkk)) içeren mesajları dikkatle yazın.

## Şablonlar

Her seferinde sıfırdan yazmak yerine, otomatik bildirimler için hazırladığınız şablonları başlangıç olarak kullanabilirsiniz.

1. Yazma ekranında **Şablonlar ve ekler** kartını bulun.
2. **Şablon olayı** listesinden bir olay seçin (sipariş ödendi, sipariş kargolandı, sipariş teslim edildi, sipariş iptal edildi, sipariş iade edildi, yeni sipariş).
3. **Dil**'i seçin (Türkçe/İngilizce).
4. **Şablonu uygula**'ya tıklayın. Konu ve gövde şablonla doldurulur ve "Şablon uygulandı: göndermeden önce `{{yer tutucuları}}` değiştirin" bildirimi çıkar.
5. Mesajı kişiselleştirin: `{{orderNumber}}`, `{{customerName}}`, `{{total}}`, `{{trackingNumber}}`, `{{trackingUrl}}`, `{{orderUrl}}` gibi değişkenleri gerçek bilgilerle değiştirin (**yalnızca** `{{storeName}}` kendiliğinden dolar).

Şablonların kendisi **Mağaza ayarları → Bildirimler → Şablonlar** kartında düzenlenir. Orada boş bıraktığınız şablonlar yerleşik varsayılana döner; yazma ekranı da bu geçerli şablonları getirir.

### Örnek

Müşteri Ayşe Yılmaz'a **DEMO-1004** numaralı siparişinin gecikeceğini bildirmek istiyorsunuz:

```
Konu: DEMO-1004 numaralı siparişiniz hakkında

Merhaba Ayşe Hanım,

DEMO-1004 numaralı siparişiniz (Seramik Vazo) üretim yoğunluğu nedeniyle 2 iş günü gecikecek. Anlayışınız için teşekkür ederiz.

{{storeName}}
```

Gönderimden önce yalnızca `{{storeName}}` kaldığından, sistem onu mağaza adınızla doldurur; mesaj gönderilebilir.

## Gönderim limitleri

Hesabınızın kötüye kullanılmasını (ele geçirilen bir hesaptan spam gönderilmesini) ve beklenmedik maliyeti önlemek için e-posta yazma özelliğine üç sınır konmuştur. Sınırlar tüm gönderim denemelerine uygulanır:

| Sınır | Değer | Kapsam | Aşılınca görülen mesaj |
|---|---|---|---|
| **Yönetici başına** | **Saatte 30** e-posta | Her yönetici hesabı kendi sayacıyla | "Hesabınız için saatlik e-posta sınırına ulaşıldı (30/saat)" |
| **Mağaza geneli** | **Günde 100** e-posta | Tüm yöneticilerin toplamı | "Mağaza genelinde günlük e-posta sınırına ulaşıldı (100/gün)" |
| **Alıcı başına** | **Günde 5** e-posta | Aynı alıcı adresi | "Bu alıcı için günlük sınıra ulaşıldı (5/gün)" |

Sınır aşıldığında bir bekleme süresi bildirilir; süre dolunca tekrar deneyebilirsiniz. Başarısız bir e-postayı tekrar göndermek de limite sayılır.

> [!NOTE]
> Bu sınırlar yalnızca panelden **elle** yazılan e-postalar içindir. Siparişlerle otomatik giden bildirimlerin ayrı kuralları vardır: **Bildirimler** sekmesindeki alıcı başına günlük e-posta sınırı (varsayılan 5) ve SMS sınırı (varsayılan 3).

### Sınırlar neden bu kadar düşük?

Bu bir e-ticaret mağazasıdır, bülten gönderim aracı değildir. Pazarlama veya toplu e-posta için uygun değildir (OpenShelf toplu e-posta göndermez). Sağlayıcı ayrıca kendi limitlerini uygulayabilir; Cloudflare E-posta Beta'dadır ve fiyatlandırması/limitleri değişebilir.

## Gönderilenler

Panelden gönderilen her e-posta **E-postalar** sayfasında listelenir. (Sipariş bildirimleri bu listede değil, ilgili siparişin **Bildirimler** kartında görünür.)

![Gönderilen e-postalar listesi](help/tr/emails-sent.png)

| Öğe | Açıklama |
|---|---|
| **Durum** filtresi | **Tümü**, **Sırada**, **Gönderildi**, **Gönderilemedi** |
| **Ara** | Alıcı veya konuya göre arar |
| Sütunlar | **Zaman**, **Alıcı**, **Konu**, **Bağlantı** (bağlı sipariş/fatura), **Durum** |

Bir satıra tıklayınca ayrıntı penceresi açılır: durum, kullanılan sağlayıcı, varsa hata mesajı ve gönderilen e-postanın tam içeriği.

### Başarısız e-postayı tekrar gönderme

1. **Gönderilemedi** durumundaki e-postaya tıklayın.
2. Hata mesajını okuyun (örneğin "Gönderen alan adı doğrulanmamış", "Alıcı adresi doğrulanmış hedef değil").
3. Nedeni giderin (alan adı doğrulama, plan, adres yazımı).
4. Pencerenin altındaki **Yeniden gönder**'e basın. Yalnızca başarısız e-postalar tekrar gönderilebilir; bu da gönderim limitlerine sayılır. Yetki: yönetici ve mağaza sahibi.

### Sık yapılan hatalar

- **"Gönderildi" yazması alıcıya ulaştığı anlamına gelmez.** Bu, sağlayıcının mesajı kabul ettiğini gösterir. Teslim edilebilirlik (spam klasörü vb.) alan adınızın SPF/DKIM/DMARC kurulumuna bağlıdır.
- **Başarısız e-postayı göz ardı etmek:** Müşteriye ulaşmamış bir iade/özür mesajı itibar kaybettirir; **Gönderilemedi** filtresini düzenli kontrol edin.
