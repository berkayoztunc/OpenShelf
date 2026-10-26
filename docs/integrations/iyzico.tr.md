# iyzico (ödeme)

[English](iyzico.md)

## Ne yapar

Hosted checkout form: müşteri iyzico sayfasında öder, kart verisi OpenShelf'e uğramaz. Worker, siparişi ödendi yapmadan önce callback/webhook imzasını doğrular ve ödemeyi sunucudan sunucuya yeniden sorgular. İadeler admin sipariş sayfasından yapılır.

## Gerekli anahtarlar

iyzico üye işyeri panelinizden API key ve Secret key (sandbox ve canlı için ayrı), ve ortam seçimi (sandbox/canlı). Admin → Ayarlar → Entegrasyonlar → iyzico'ya girin; secret key şifreli saklanır ve sonra maskeli görünür. Sağlık kontrolü için "Bağlantıyı test et"i kullanın.

## Webhook / callback

Callback URL: `<API_ORIGIN>/api/store/payment/callback/iyzico`. Webhook URL: `<API_ORIGIN>/webhooks/payment/iyzico`. Hesabınız destekliyorsa webhook'u iyzico panelinde tanımlayın.

## Sandbox

Sandbox anahtarlarıyla ve iyzico'nun yayımladığı test kartlarıyla başlayın (iyzico dokümanına bakın). Tam bir test sipariş ve iadeden sonra canlı anahtarlara geçin.

## Uyarılar

Onaylı bir iyzico üye işyeri hesabı gerekir. iyzico'nun istediği alıcı kimlik/adres alanlarının checkout'ta toplanması gerekebilir. Taksit, komisyon ve hesaba geçiş iyzico koşullarıdır. Adaptör mock ve contract testlerle sınanmıştır, canlı hesaplarla değil.
