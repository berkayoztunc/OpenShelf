# Twilio (SMS)

[English](twilio.md)

## Ne yapar

İşlemsel SMS'leri Twilio Messages API'si üzerinden gönderir (bkz. [../notifications.tr.md](../notifications.tr.md)). Türkiye dışındaki numaralara ulaşmanız gerekiyorsa işe yarar (önce ülke kodunu izin listesine ekleyin).

## Gerekli bilgiler

Admin, Ayarlar, Entegrasyonlar, Twilio ekranına girin (şifreli saklanır):

| Alan | Anlamı |
|---|---|
| `accountSid` | Account SID, `AC` + 32 onaltılık karakter |
| `authToken` (gizli) | Auth Token |
| `from` | E.164 biçiminde gönderici numara, örn. `+15551234567` |
| `messagingServiceSid` | Messaging Service SID (`MG...`); doluysa `from` yerine o kullanılır |

`from` veya `messagingServiceSid` alanlarından biri zorunludur. Hedef ülke izin veriyorsa alfanümerik gönderici, Ayarlar, Bildirimler, SMS gönderici kimliği alanından belirlenebilir.

## Sandbox ve test

Twilio test kimlik bilgileri ve deneme (trial) hesapları sunar; trial hesaplar yalnızca doğrulanmış numaralara mesaj atabilir. Güncel kurallar için Twilio dokümanına bakın, sonra Ayarlar, Bildirimler ekranından test gönderin.

## Dikkat edilecekler

- Durum: satıcı dokümanlarına göre uygulandı, **canlı hesapla DOĞRULANMADI**.
- Gönderici kaydı (A2P 10DLC, alfanümerik gönderici kimlikleri, yerel mevzuat) sizin sorumluluğunuzdadır ve ülkeye göre değişir.
- Twilio parça başına ücretlendirir; Türkçe karakterler UCS-2'ye geçirir (parça başına 70 karakter).
- Varsayılan `+90` ülke izin listesinin dışındaki mesajlar, listeyi genişletene kadar atlanır.
