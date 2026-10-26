# Adaptör yazımı

[English](adapter-guide.md)

Adaptörler `packages/integrations/<id>` altında yaşar ve `@openshelf/integration-sdk` sözleşmelerini uygular. API worker, `workers/api/src/integrations/registry.ts` üzerinden `ProviderId` değerini her paketin `factory` export'una eşler.

## Sözleşmeyi seçin

| Tür | Arayüz | Temel metotlar |
|---|---|---|
| Ödeme | `PaymentProvider` | `createCheckout`, `verifyWebhook`, `retrieve`, `refund?` |
| Kargo | `ShippingProvider` | `quote`, `createShipment`, `track`, `cancel` |
| Fatura | `InvoicingProvider` | `issue(input, idempotencyKey)`, `cancel` |
| Pazaryeri | `MarketplaceProvider` | `pushStockAndPrice`, `fetchOrders`, `updateShipment?`, `verifyWebhook?` |
| Analitik/Reklam | `ServerEventSink` | `send(event, ctx)` |
| SMS | `SmsProvider` | `send({ to, text, senderId? })` |
| E-posta | `EmailProvider` | `send({ to, from, subject, html, text })` |

Hepsi `OpenShelfIntegration`'ı genişletir: `id`, `validateConfig()`, `healthCheck(): Promise<{ok, detail?}>`.

## Adımlar

1. `@openshelf/shared` içindeki `ProviderId`'ye yeni id ekleyin.
2. `packages/integrations/<id>` oluşturun (mevcut bir adaptörün `package.json`/`tsconfig` dosyalarını kopyalayın).
3. Manifest ve factory export edin (örnek kod için [İngilizce rehbere](adapter-guide.md) bakın): `manifest` (`publicFields`, `secretFields`, Zod `schema`) ve `create(creds, deps)`.

Admin formu `publicFields`/`secretFields`'ten üretilir; secret'lar yaz-only'dir. `deps.fetch` ve `deps.now()` kullanın (global `fetch` değil) ki testlerde mock'lanabilsin.

## Kurallar

- **Host'lar**: yalnızca sağlayıcının sabit host izin listesine (sandbox ve canlı) çağrı yapın. Kullanıcı girdisinden veya sağlayıcı yanıtından gelen URL'yi host kontrolü olmadan çağırmayın.
- **Secret'lar**: asla loglamayın, hata mesajına koymayın; istek/yanıt dökümlerini maskeleyin.
- **Webhook'lar**: ham gövdede imzayı doğrulayın (`rawBody` verilir), varsa zaman damgasını kontrol edin, sonra sağlayıcıdan yeniden sorgulayın; kararlı `eventId` ile normalize olay döndürün. Tekrar koruması çekirdektedir.
- **İdempotensi**: handler birden fazla çalışabilir (outbox yeniden denemeleri). Verilen idempotency key / sağlayıcının idempotensi özelliklerini kullanın.
- **Para**: SDK'da tam sayı minor birim; dönüşümü yalnızca sağlayıcı sınırında yapın.
- **Hatalar**: secret içermeyen tipli hatalar fırlatın; geçici hatalar outbox backoff ile yeniden denensin diye fırlatılmalıdır.
- **CI'da canlı çağrı yok**: testler sağlayıcı dokümanlarından alınmış veya elle yazılmış fixture'larla mock `fetch` kullanır.

## Test

Vitest ile contract test yazın: sahte `deps.fetch` enjekte edin; istek şeklini (URL host, header, gövde), başarı/hata/imza hatası fixture'larını ve `healthCheck`/`validateConfig` davranışını doğrulayın. `pnpm --filter @openshelf/integration-<id> test`.

## Kayıt ve dokümantasyon

Factory'yi registry'ye ekleyin (API worker sahipleri inceler), `docs/integrations/<id>.md` ve `.tr.md` ekleyin (gereken anahtarlar, nereye girildiği, sandbox notları, uyarılar) ve adaptör şablonuyla PR açın.
