# MCP: mağazayı AI asistanlarıyla yönetin

[English](mcp.md)

OpenShelf'in tüm yönetimi `https://<adresiniz>/mcp` adresinde bir **MCP sunucusu** (Streamable HTTP, durumsuz) olarak sunulur. Bir AI istemcisi (Claude Desktop, Claude Code, herhangi bir MCP istemcisi) soruları yanıtlar ve sipariş, ürün, stok, kupon, müşteri, kampanya, SMS/e-posta, fatura, ayar, Trendyol ve Geliver'ı yönetebilir.

## Bağlanma
1. Yönetim paneli → **Ayarlar → MCP / AI erişimi → Anahtar oluştur** (yalnızca owner/admin). Seviye ve süre seçin. Anahtar (`osk_…`) **bir kez** gösterilir.
2. Claude Code: `claude mcp add --transport http openshelf https://<adres>/mcp --header "Authorization: Bearer osk_…"`
   Genel istemci (JSON): `{"mcpServers":{"openshelf":{"type":"http","url":"https://<adres>/mcp","headers":{"Authorization":"Bearer osk_…"}}}}`
3. Sorun: "bugünkü siparişleri özetle", "hangi ürünlerin stoğu azaldı?", "İzmir'deki müşteriler için yaz kampanyası taslağı hazırla".

Sunucu JSON döner; istemci yalnızca SSE kabul ediyorsa tek bir `text/event-stream` olayı döner. Durumsuzdur (oturum yok), sade bir Worker'da çalışır.

## Seviyeler
| Seviye | Yapabilir |
|---|---|
| **read** | her şeye bakar: pano, sipariş, müşteri, ürün, ayar, log, Trendyol sağlığı, önizleme, kitle büyüklüğü |
| **write** | + ürün, kategori, kupon, stok, sipariş durumu, ayar grubu, kampanya/fatura taslağı, Trendyol eşleştirme/aktarım |
| **full** | + iade, kargo, fatura, silme, e-posta/SMS/kampanya gönderme, anonimleştirme, CSV içe aktarma, ham Trendyol/Geliver çağrıları |

`full` araçlar yalnızca `confirm: true` ile çalışır; yoksa ne yapacaklarını anlatır. Anahtar sahibinin rolünü aşmaz ve asla *owner* gibi davranmaz.

## Araç izinleri (owner)
**Ayarlar → MCP / AI erişimi → Araçlar** her aracı gruplarıyla ve bir onay kutusuyla listeler. Bir aracın işaretini kaldırırsanız hiçbir AI istemcisi onu göremez veya çağıramaz; `full` anahtar olsa bile (araç yalnızca işaretliyse **ve** anahtarın seviyesi izin veriyorsa çalışır). Hazır ayarlar: yalnızca okuma araçları, `full` araçlar kapalı, hepsine izin ver. Ana şalter anahtarları silmeden tüm MCP erişimini kapatır. Yalnızca owner değiştirebilir; admin görüntüler; anahtar asla değiştiremez. Varsayılan: her şey açık.

## MCP'den asla erişilemeyenler
Kullanıcı/şifre/MFA, anahtar oluşturma, entegrasyon **sırlarını** yazma, mock modu anahtarı, fabrika sıfırlama, mock gelen kutusu, Trendyol geçmişi silme. Yeni bir admin rotası ne araç ne de hariç tutma listesinde ise `mcp.test.ts` kırılır (`workers/api/src/mcp/tools.ts`).

## Güvenlik notları
- Anahtar mağazayı yönetir: şifre gibi saklayın, aynı sekmeden iptal edin. Anahtarlar SHA-256 özeti olarak saklanır; anahtar başına dakikada 120 istek.
- Her araç çağrısı denetim kaydına yazılır (`mcp.tool`, anahtar kimliği, sonuç, argümansız); asıl yönetim işlemi de normal şekilde kaydedilir.
- Araçlar gerçek admin API'yi süreç içinde, HMAC imzalı 60 saniyelik dahili bir iddiayla çalıştırır; yetki, doğrulama ve hız sınırları panelle aynıdır. Anahtar `/api/admin/*`'a doğrudan erişemez.
- Pazarlama kampanyaları yalnızca pazarlama izni olan müşterilere gider. AI konuşmaları müşteri verisi içerebilir: `read` ile başlayın.

## Araç eklemek
`workers/api/src/mcp/tools.ts` dosyasına bir kayıt ekleyin (ad, seviye, method, path, zod şekli). Yanıtlar ~100 KB ile sınırlıdır.
