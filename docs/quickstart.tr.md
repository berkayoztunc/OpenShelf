# Hızlı başlangıç

[English](quickstart.md)

## Yerel geliştirme

Gereksinimler: Node >= 20, pnpm.

```bash
pnpm install
pnpm setup:local                        # .dev.vars + workers/api/.dev.vars oluşturur, yerel migrasyonları uygular
pnpm seed                               # isteğe bağlı: "OpenShelf Demo" mağazası (12 ürün, 2 kupon)
pnpm dev                                # vitrin :5173, admin :5174/admin/, API :8787
```

Betiğin ne yapacağını değişiklik yapmadan görmek için: `node tooling/setup/setup.mjs --dry-run`.

### İlk yönetici

`http://localhost:5174/admin/setup` adresini açın, `workers/api/.dev.vars` içindeki `SETUP_TOKEN` değerini girin ve sahip (owner) hesabını oluşturun (parola en az 12 karakter). Token tek kullanımlıktır; ilk yönetici oluşunca uç nokta kilitlenir. Profilinizden TOTP MFA'yı açın.

Seed bilinçli olarak yönetici oluşturmaz.

### Sağlayıcı hesabı olmadan deneme

[Mock Modunu](mock-mode.tr.md) açın (`ALLOW_MOCK` tanımlayın, sonra Ayarlar, Sistem); sahte ödeme sayfası ve SMS/e-posta için Mock Inbox elde edersiniz. Bildirimler [notifications.tr.md](notifications.tr.md) dosyasında anlatılır.

### Komutlar

| Komut | Amaç |
|---|---|
| `pnpm typecheck` / `lint` / `test` / `build` | kalite kapıları (CI ile aynı) |
| `pnpm db:generate` | şema değişince migrasyon üretir |
| `pnpm db:migrate:local` | yerel D1'e migrasyon uygular |
| `pnpm seed` | yerel D1'e demo veri yükler (uzak DB'yi reddeder) |
| `pnpm dev:site` | gerçek tek-Worker düzenini derler ve önizler |

## Canlıya çıkış

[deploy-cloudflare.tr.md](deploy-cloudflare.tr.md) rehberini izleyin. Gerçek sipariş almadan önce: yasal metinleri hazırlayın ([legal-notes.tr.md](legal-notes.tr.md)), iyzico'yu önce sandbox'ta deneyin ([integrations/iyzico.tr.md](integrations/iyzico.tr.md)), test siparişi verin, sonra canlı anahtarlara geçin.

## Yayın kontrol listesi

- [ ] Ayarlar → Genel: mağaza adı, iletişim, vergi bilgileri
- [ ] Yasal metinler sizin (ve bir uzmanın) gözünden geçti
- [ ] Ödeme önce sandbox'ta, sonra canlıda denendi
- [ ] Origin değişkenleri gerçek `https://` URL'lerinize sabitlendi (isteğe bağlı ama önerilir; bkz. [deploy-cloudflare.tr.md](deploy-cloudflare.tr.md))
- [ ] Mock Modu kapalı ve `ALLOW_MOCK` kaldırıldı
- [ ] Tüm yöneticilerde MFA açık
- [ ] Yedek/dışa aktarma denendi ([security.tr.md](security.tr.md))
- [ ] Test sipariş, iade ve kargo akışı tamamlandı
