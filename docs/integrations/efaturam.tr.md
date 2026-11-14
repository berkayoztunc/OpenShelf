# e-Faturam (e-Fatura / e-Arşiv)

[English](efaturam.md)

## Ne yapar

Siparişler için e-Fatura veya e-Arşiv faturası keser (`invoice.issue` outbox işiyle otomatik veya sipariş sayfasından), numara ve PDF/URL'yi saklar. `(order_id, type)` bazında idempotent'tir; yeniden denemeler mükerrer fatura üretmez.

## Gerekli anahtarlar

e-Faturam'a giriş yaptığınız e-posta adresi ve şifre (Admin → Ayarlar → Entegrasyonlar → e-Faturam; secret alanlar şifrelenir). OpenShelf `POST /api/auth/signin` ile oturum açar ve dönen `x-access-token` değerini her istekte gönderir. `companyId` ve `userId` bu anahtarın içinden okunur; "Bağlantıyı test et" bulunamadığını söylerse iki isteğe bağlı alana elle girin. Ayarlar → Genel'de satıcı vergi no ve yasal adresi girin.

## Sandbox

Ortamı formdan seçin. Canlı `https://apigateway.trendyolecozum.com`, test `https://stage-apigateway.trendyolefaturam.com`; başka adres kabul edilmez. Test ortamı IP adresinizin e-Faturam tarafından tanımlanmasını ister (entegrasyon@trendyolefaturam.com) ve ayrı kullanıcı bilgisi kullanır; canlı ortamda IP kısıtı yoktur. Cloudflare Worker'ın sabit çıkış IP'si olmadığı için test ortamına yayındaki Worker'dan erişilemez.

## Uyarılar

**Kapsam sözleşmeyle doğrulanmalıdır.** e-Faturam'ın Trendyol dışı kanallardan (web siteniz, diğer pazaryerleri) gelen siparişlerin faturalandırmasını veya her mükellef türünü kapsadığını varsaymayın. Otomatik faturalamayı açmadan önce sözleşmenizin hangi sipariş kaynaklarına, belge türlerine ve müşteri türlerine izin verdiğini e-Faturam'dan yazılı teyit edin. Trendyol siparişleri Trendyol'un kendi akışlarıyla zaten faturalanıyor olabilir; mükerrer faturadan kaçının. Fatura yükümlülükleri vergi durumunuza bağlıdır: mali müşavirinize danışın. Adaptör herkese açık API dokümanına (developers.trendyolefaturam.com) göre yazılmıştır ama mock ile sınanmıştır, canlı hesapla değil.

## Bilinen eksikler

- 1 Temmuz 2024'ten beri internet satışı e-Arşiv faturalarında ödeme ve gönderi bilgileri (`paymentInfo`, `deliveryInfo`) zorunludur. Fatura girdisinde taşıyıcı ve ödeme verisi olmadığı için adaptör bunları henüz göndermez.
- Anahtarın içindeki `companyId` / `userId` alan adları dokümanda yazmıyor; adaptör `companyId` ve `userId` adlarını dener.
- API üzerinden yalnızca e-Arşiv faturası iptal edilebilir.
- Yeniden denemeler aynı ETTN'yi kullanır (sipariş no ve türden türetilir); yanıt kaybolsa bile ikinci fatura oluşmaz.
