# Netgsm (SMS)

[English](netgsm.md)

## Ne yapar

İşlemsel SMS'leri (sipariş bildirimleri, bkz. [../notifications.tr.md](../notifications.tr.md)) Netgsm REST v2 API'si (`api.netgsm.com.tr`, izin verilen tek host) üzerinden gönderir. Türkçe metin `encoding: "TR"` ile iletilir.

## Gerekli bilgiler

Admin, Ayarlar, Entegrasyonlar, Netgsm ekranına girin (şifreli saklanır):

| Alan | Anlamı |
|---|---|
| `usercode` (gizli) | Netgsm abone numarası / kullanıcı kodu |
| `password` (gizli) | Netgsm API alt kullanıcısının şifresi |
| `msgheader` | gönderici başlığı, 3-11 karakter, Netgsm hesabınızda kayıtlı olmalı |

Ayarlar, Bildirimler, SMS gönderici kimliği doluysa `msgheader` yerine o kullanılır.

## Sandbox ve test

Doğruladığımız herkese açık bir Netgsm sandbox'ı yok. Geliştirme için Mock Modunu kullanın ([../mock-mode.tr.md](../mock-mode.tr.md)); ardından Ayarlar, Bildirimler ekranından kendi numaranıza tek bir test SMS'i gönderin.

## Dikkat edilecekler

- Durum: satıcı dokümanlarına göre uygulandı, **canlı hesapla DOĞRULANMADI**. Özellikle bakiye/sağlık kontrolü uç noktası teyit edilemedi.
- msgheader onayı, İYS (ticari ileti izni) kuralları ve kontör bakiyesi Netgsm tarafında yönetilir. OpenShelf yalnızca işlemsel mesaj gönderir (`iysfilter: "0"`).
- Türkiye dışı numaralara SMS, varsayılan ülke izin listesi (`+90`) nedeniyle engellenir.
- Türkçe karakterli mesajlar UCS-2 parçaları kullanır; şablon editöründeki parça sayacına bakın.
