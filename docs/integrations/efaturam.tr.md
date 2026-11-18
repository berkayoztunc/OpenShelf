# e-Faturam (e-Fatura / e-Arşiv)

[English](efaturam.md)

## Ne yapar

Siparişler için e-Fatura veya e-Arşiv faturası keser (yalnızca elle: sipariş sayfasındaki **Fatura kes** düğmesi `invoice.issue` outbox işini kuyruğa atar; ödeme sonrası OTOMATİK fatura YOKTUR), numara ve PDF/URL'yi saklar. `(order_id, type)` bazında idempotent'tir; yeniden denemeler mükerrer fatura üretmez.

## Gerekli anahtarlar

e-Faturam'a giriş yaptığınız e-posta adresi ve şifre (Admin → Ayarlar → Entegrasyonlar → e-Faturam; secret alanlar şifrelenir). OpenShelf `POST /api/auth/signin` ile oturum açar ve dönen `x-access-token` değerini her istekte gönderir. `companyId` ve `userId` bu anahtarın içinden okunur; "Bağlantıyı test et" bulunamadığını söylerse iki isteğe bağlı alana elle girin. Ayarlar → Genel'de satıcı vergi no ve yasal adresi girin.

## Sandbox

Ortamı formdan seçin. Canlı `https://apigateway.trendyolecozum.com`, test `https://stage-apigateway.trendyolefaturam.com`; başka adres kabul edilmez. Test ortamı IP adresinizin e-Faturam tarafından tanımlanmasını ister ve ayrı kullanıcı bilgisi kullanır. e-Faturam'ın bireysel entegrasyon SSS'si API'nin yalnızca tanımlı IP adreslerinden kullanılabildiğini söyler; pazaryeri dokümanı ise canlı ortamda IP kısıtı olmadığını yazar. Cloudflare Worker'ın sabit çıkış IP'si olmadığı için IP tanımı gereken ortama yayındaki Worker'dan erişilemez; engellenen istek 403 döner ve konsol bunu "IP engeli" olarak gösterir.

## Uyarılar

**Kapsam sözleşmeyle doğrulanmalıdır.** e-Faturam'ın Trendyol dışı kanallardan (web siteniz, diğer pazaryerleri) gelen siparişlerin faturalandırmasını veya her mükellef türünü kapsadığını varsaymayın. Otomatik faturalamayı açmadan önce sözleşmenizin hangi sipariş kaynaklarına, belge türlerine ve müşteri türlerine izin verdiğini e-Faturam'dan yazılı teyit edin. Trendyol siparişleri Trendyol'un kendi akışlarıyla zaten faturalanıyor olabilir; mükerrer faturadan kaçının. Fatura yükümlülükleri vergi durumunuza bağlıdır: mali müşavirinize danışın. Adaptör herkese açık API dokümanına (developers.trendyolefaturam.com) göre yazılmıştır ama mock ile sınanmıştır, canlı hesapla değil.

## Konsol

Admin → e-Faturam konsolu (yalnızca sahip ve yöneticiler) bağlantıyı elle denemek içindir:

- **Dene → Bağlantı tanılama**: giriş yapar ve zararsız bir sorgu atar; giriş, oturum anahtarı, firma/kullanıcı ID ve API çağrısı adımlarından hangisinin takıldığını e-Faturam'ın hata koduyla gösterir. "Bağlantıyı test et" yalnızca girişi dener; giriş çalışıp çağrılar 401 veriyorsa bunu çalıştırın.
- **Giden faturalar**: mağazanın e-Faturam üzerinden kestiği faturalar (sipariş faturaları ve elle kesilenler). e-Faturam giden faturaları listeleyen bir çağrı sunmadığı için liste mağazanın kendi kaydıdır; her satırın e-Faturam'daki durumu ve PDF'i sorgulanabilir.
- **Dene**: bir VKN / TCKN'nin e-Fatura mükellefi olup olmadığını sorgular; ETTN ile bir faturanın durumuna bakar, PDF bağlantısını alır, e-Arşiv faturayı iptal eder.
- **Gelen e-Faturalar**: size kesilen e-Faturaları tarih aralığına göre listeler (yalnızca okur).
- **API gezgini**: katalogdaki her işlemi örnek gövdesiyle çalıştırır. `companyId` ve `userId` boş bırakılırsa oturumdaki hesaptan eklenir.

Canlı ortamda veri değiştiren her çağrı onay ister; fatura oluşturan çağrılar GİB'e bildirilen gerçek fatura keser. Mock modunda hiçbir şey e-Faturam'a gitmez: yanıtlar sahte ama doğrulama aynıdır ("1" ile başlayan 10 haneli VKN mükellef sayılır). Partner uçları, irsaliye ve dosya yükleme uçları konsolda yoktur.

## Bilinen eksikler

- 1 Temmuz 2024'ten beri internet satışı e-Arşiv faturalarında ödeme ve gönderi bilgileri (`paymentInfo`, `deliveryInfo`) zorunludur. Fatura girdisinde taşıyıcı ve ödeme verisi olmadığı için adaptör bunları henüz göndermez.
- Anahtarın içindeki `companyId` / `userId` alan adları dokümanda yazmıyor; adaptör `companyId` ve `userId` adlarını dener.
- API üzerinden yalnızca e-Arşiv faturası iptal edilebilir.
- Yeniden denemeler aynı ETTN'yi kullanır (sipariş no ve türden türetilir); yanıt kaybolsa bile ikinci fatura oluşmaz.
