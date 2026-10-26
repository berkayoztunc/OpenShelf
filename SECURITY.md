# Security Policy / Güvenlik Politikası

## Reporting a vulnerability

Please do **not** open a public issue. Report privately via GitHub's "Report a vulnerability" (Security → Advisories) on this repository, or email the maintainers at the address listed in the repository profile.

Include: affected component and version/commit, reproduction steps, impact, and any suggested fix. Do not include real customer data.

## Our commitments

- Acknowledge within 3 business days; initial assessment within 10 business days.
- Fix or mitigate critical issues as quickly as practical; coordinate disclosure with you. We aim for public disclosure within 90 days of the report, or sooner once a fix is released.
- Credit reporters in the advisory unless they prefer anonymity.
- No legal action against good-faith research that avoids privacy violations, data destruction and service disruption, and that only targets your own deployment.

## Scope

In scope: this repository (API worker, admin, storefront, packages, tooling, CI). Out of scope: third-party services (Cloudflare, iyzico, Trendyol, etc.), social engineering, DoS/volumetric testing, findings requiring a compromised admin account or Cloudflare account.

## Supported versions

Pre-1.0: only the latest `main` / latest release receives fixes.

## Operator guidance

Secrets rotation, backups and threat model: [docs/security.md](docs/security.md).

---

## Güvenlik açığı bildirimi

Lütfen herkese açık issue **açmayın**. Bu depoda GitHub "Report a vulnerability" (Security → Advisories) üzerinden veya depo profilindeki iletişim adresiyle özel olarak bildirin. Gerçek müşteri verisi eklemeyin. 3 iş günü içinde yanıt, 10 iş günü içinde ilk değerlendirme hedeflenir; iyi niyetli, yalnızca kendi kurulumunuzu hedefleyen araştırmalara karşı hukuki işlem yapılmaz. Kapsam ve rotasyon rehberi için: [docs/security.tr.md](docs/security.tr.md).
