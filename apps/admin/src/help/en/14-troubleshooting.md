# Troubleshooting and FAQ

In this section you will find the most common problems laid out as "symptom, cause, fix." When the panel shows an error, it tells you what happened and what to do; here we explain the reasons behind those same messages, plus extra tips. Error codes are given in parentheses; quoting the code when you ask for support speeds things up.

> [!TIP]
> Look at these first: refresh the page, sign out and back in, and glance at the **Integration events** page. Between them they explain most problems.

## Sign-in problems {#giris-sorunlari}

| Symptom | Cause | Fix |
|---|---|---|
| "Too many failed sign-in attempts; the account is temporarily locked. Wait a while and try again." (`account_locked`) | There were 5 failed sign-ins in 15 minutes from the same email and IP, or 20 from the same IP | Wait 15 minutes. Until that time is up, even the correct password is not accepted. [Lockout](/help/security#kilitlenme) |
| "Too many requests in a short time. This is a safety measure." (`rate_limited`) | Too many requests were made in a short time (for example more than 20 in 15 minutes at sign-in) | Wait a minute and try again; follow the wait time given in the response |
| "Bot verification (captcha) is required. Complete it and try again." (`turnstile_required`) / "Bot verification failed. Refresh the page and try again." (`turnstile_failed`) | Verification is requested after repeated failed attempts | Complete the verification and try again; if it keeps failing, turn off browser extensions |
| My password is right but I cannot get in | The two-step code is wrong, expired or already used. The message reads "The code is wrong or has expired." (`invalid_code`) | Set your phone's clock to automatic and wait for a new code. The same code is not accepted twice |
| My phone is lost and I have no two-step code | There are no recovery codes | Add it to a new phone with the key you wrote down at setup; otherwise technical intervention is needed. [Two-step verification](/help/security#iki-adimli-dogrulama) |
| "Your session has expired. Please sign in again." | 2 hours of inactivity, or the 12-hour limit | Sign in again. [Sessions](/help/security#oturumlar) |
| "The request did not come from an allowed address." (`origin`) / "The security check (CSRF) failed; your session details may be stale." (`csrf`) when saving | You came in from a different address than the one pinned for the panel, or the page is very old | Open the panel from the right address, refresh the page, and sign out and in. If you pinned the address, see [Domain](/help/going-live#alan-adi) |
| The setup page says the configuration is missing (503, `misconfigured`: "The server configuration is missing or wrong.") | `APP_ENCRYPTION_KEY` is missing or malformed | In Cloudflare, define a 32-byte base64 key as a Worker secret and try again |
| At setup, "Setup has already been completed. Sign in with your existing account." (`setup_locked`) | The owner account has already been created | Use the normal sign-in; for the password, ask another owner |
| At setup, "The setup token is wrong." (`invalid_setup_token`) / "The setup token (SETUP_TOKEN) is not configured on the server." (`setup_disabled`) | The wrong `SETUP_TOKEN`, or none defined at all | Check the `SETUP_TOKEN` secret in Cloudflare |
| The storefront or a blank page opens instead of the panel | The address does not end in `/admin/`, or the deployment is incomplete | Open the `/admin/` address; if it is still blank, redeploy the site |
| When changing the password, "Your current password is incorrect." (`invalid_password`) | The current password was typed wrongly | Type the right one |
| "At least one active owner is required." (`last_owner`) | You tried to delete or demote the last owner | First make another account an owner |
| "This email address is already used by another user." (`email_taken`) | Another user already has this email | Enter a different email |

> [!NOTE]
> There is no "forgot password" link in the panel. An owner account can reset another user's password.

## Payment problems {#odeme-sorunlari}

| Symptom | Cause | Fix |
|---|---|---|
| The customer sees "Could not start the payment. Try again shortly; if it persists, test the iyzico settings." (`payment_provider_error`) | iyzico rejected the request or could not be reached | Look at **Integration events**, and check the keys and the environment (Live/Sandbox) |
| "No payment provider is enabled. Enable iyzico on the Integrations page or turn on mock mode." (`payment_unavailable`) | iyzico is off or incomplete | Enable the **Integrations → iyzico** card ([iyzico](/help/integrations#iyzico)) |
| The customer paid but the order shows "Awaiting payment" | The notification has not arrived yet or could not be verified | Wait a few minutes, then open the order and look at the payment status. [Payment verification](/help/orders#odeme-dogrulama) |
| In Integration events, an amount/currency mismatch | The amount paid did not match the order | The order is not confirmed; check the payment in the iyzico panel and refund it if necessary |
| "Payment arrived but the order is cancelled" (late payment) | The stock reservation expired and the order was cancelled, then the payment came in | Make a **manual refund** to the customer; consider lengthening the reservation period |
| "Not enough stock. Reduce the quantity or update the stock." (`insufficient_stock`) / "Some items are no longer available. Update the cart and try again." (`items_unavailable`) | Stock ran out or someone else bought it | The customer must update their cart; check the stock |
| "This cart has already been checked out. Create a new cart." (`cart_already_checked_out`) | A second payment was attempted from the same cart | The customer must rebuild the cart (add the products again and continue) |
| "There are too many unpaid orders. Complete the existing ones or wait for them to expire." (`too_many_pending_orders`) | The customer has many incomplete orders | Wait for them to expire, or complete them |
| "Guest checkout is disabled. The customer needs to create an account." (`guest_checkout_disabled`) | Guest checkout is off in the **Checkout** settings | Turn the setting on, or have the customer continue with an account |
| Coupon "This coupon has already been used with this email." (`coupon_already_used`) / "The coupon's usage limit is reached." (`coupon_exhausted`) | The coupon was used with this email, or is used up | Review the coupon's limit. [Coupons](/help/catalog#kuponlar) |
| Refund: "The refund cannot be more than the amount paid." (`refund_exceeds_payment`) | The refund amount is larger than the payment | Lower the amount |
| Refund: "The order has no successful payment to refund." (`no_payment`) | The order has no paid record | Cancel the order instead of refunding |
| Refund: "The payment provider rejected the refund." (`refund_failed`) | iyzico rejected it | Check the iyzico panel and the details; a failed refund is in the audit log |
| Refund: "The payment provider does not support refunds for this payment." (`refund_unsupported`) | The payment provider has no refund for it | Make the refund from the provider's panel |
| Refund: "The payment and the current mode do not match" (`mock_mismatch`) | A fake (mock) payment is being refunded in real mode, or a real payment in mock mode | Turn mock mode on or off according to the payment's type. [Turning off mock mode](/help/going-live#mock-u-kapatma) |
| Mock mode cannot be turned on: `mock_not_allowed` ("Mock mode is disabled by configuration on this deployment.") | `ALLOW_MOCK` is not defined on the server | Define `ALLOW_MOCK=true` only on a test/demo site, never on a live one |
| Mock mode cannot be turned on: `real_payment_enabled` ("Mock mode cannot be turned on while a real payment provider is enabled.") | A real payment provider is enabled | First disable the iyzico card |
| Mock mode cannot be turned on: `real_orders_in_flight` ("There are real orders that are not finished yet...") | There are real paid / being-fulfilled / shipped orders | Complete or deliver those orders |
| A real integration will not change: `mock_mode_active` ("Real integrations cannot be changed while mock mode is on.") | Mock mode is on | Turn it off on the **System** tab |

> [!DANGER]
> Do not turn on mock mode in a live store. Orders are created without taking any money from the customer. Use it only on test sites.

## Invoice problems {#fatura-sorunlari}

| Symptom | Cause | Fix |
|---|---|---|
| "No invoicing provider is enabled." (`no_invoicing_provider` / `invoicing_unavailable`) | e-Faturam is off or not configured | Enable **Integrations → Trendyol e-Faturam**, or use mock mode. [e-Faturam](/help/integrations#e-faturam) |
| "The invoicing provider did not accept the invoice." (`issue_failed`) | The invoicing provider rejected the request (most often a VKN/TCKN, address or series error) | Look at the detail in the message, fix the buyer details and try again. [VKN and TCKN](/help/invoices#vkn-ve-tckn) |
| "The invoice is already issued." (`already_issued`) | A second issuing was attempted | No new invoice is needed |
| "The invoice is being issued or can no longer be issued." (`issue_in_progress`) | Another operation is in progress | Wait a few minutes and refresh the page |
| "Only draft or failed invoices can be edited." (`not_editable`) | An issued invoice cannot be edited | Cancel it and issue a new one. [Invoice cancellation](/help/invoices#fatura-iptali) |
| "Only draft invoices can be deleted." (`not_deletable`) | An issued invoice cannot be deleted | Cancel it |
| "The record's status does not allow this action." (`invalid_state`), for example when only issued invoices can be cancelled | The invoice is already cancelled or was never issued | Check the status |
| "The invoice total must be greater than zero." (`zero_total`) | All lines are zero | Fix the amounts |
| "The line discount exceeds the amount" (validation error) | The discount is larger than the line total | Reduce the discount |
| "The order status does not allow this action (for example, an unpaid order cannot be shipped)." (`invalid_order_state`), when the order is unpaid | An attempt was made to invoice an unpaid order | The payment must arrive first |
| "Too many requests in a short time." (`rate_limited`) on invoice actions | Too many actions in a short time | Wait a little |

Most invoice errors come from the buyer details: a VKN must be 10 digits and a TCKN 11. (VKN is the tax ID number and TCKN the national ID number in Türkiye.) Details: [Invoices](/help/invoices#sik-hatalar).

## Email and SMS problems {#e-posta-ve-sms-sorunlari}

| Symptom | Cause | Fix |
|---|---|---|
| "No e-mail provider is enabled." (`no_email_provider`) | Cloudflare Email is off | Enable **Integrations → Cloudflare Email** ([Cloudflare Email](/help/integrations#cloudflare-e-posta)) |
| "The provider rejected the message." (`send_failed`) | The sending domain is not verified, the recipient is not allowed (on Beta/the free plan only verified addresses), or the key is wrong | Look at the error detail in the **Emails** list, check the domain and the plan, and try **Resend** |
| "The text still has placeholders that are not filled in." (`unresolved_placeholders`) | An unfilled `{{...}}` field was left in the email | Replace the placeholder with real information. [Writing an email](/help/email#e-posta-yazma) |
| "The hourly e-mail limit for your account was reached (30 per hour)." (`rate_limited_admin`) | An admin can send at most 30 emails per hour | Wait an hour |
| "The daily store-wide e-mail limit was reached (100 per day)." (`rate_limited_total`) | 100 emails per day across the whole store | Leave it until the next day. [Sending limits](/help/email#gonderim-limitleri) |
| "The daily limit for this recipient was reached (5 per day)." (`rate_limited_recipient`) | 5 per day to the same person | Try tomorrow |
| "The recipient is not valid." (`invalid_recipient`) | The email format is wrong, or the phone is not in the `+905301234567` format | Fix it. [E.164](term:e164) |
| Only failed emails can be resent / it is already being resent (`invalid_state`) | The status is not suitable | Check the status |
| Notification "Skipped: country not allowed" (`country_not_allowed`) | The SMS recipient's country code is not on the allow-list (by default only `+90`) | Add it to the country list in the **Notifications** settings |
| Notification "Skipped: daily cap" (`daily_cap`) | The daily per-recipient SMS/email limit was reached | Review the limit, or wait |
| Notification "Skipped: no recipient / invalid" (`no_recipient`, `invalid_recipient`) | The customer has no phone/email, or the format is wrong | Check the order details |
| The SMS does not go out; the sender name was rejected | The [SMS sender ID](term:smsheader) is not approved at the provider | Get it approved at the provider; at most 11 characters, no Turkish characters or spaces |
| Test message: "Too many requests in a short time." (`rate_limited`) | Test sending is 5 per hour per admin and 10 per IP | Wait |
| "No notification provider" (test sending) | The provider for that channel is not enabled | Enable the integration ([Netgsm](/help/integrations#netgsm), [Twilio](/help/integrations#twilio)) |

If you think messages are not going out at all, mock mode may be on: messages land in the **Mock inbox**. See the pages [Notification settings](/help/store-settings#bildirimler) and [Order notifications](/help/orders#siparis-bildirimleri).

## Integration errors {#entegrasyon-hatalari}

The **Integration events** page lists problems with external services (level: Info, Warning, Error). If background jobs ([outbox](term:outbox)) fail, the system retries automatically at ever-longer intervals (starting at 30 seconds and going up to at most 1 hour). The statuses are: **Pending**, **Running**, **Done**, **Failed (will retry)**, **Dead (gave up)**.

![Integration events](help/en/integration-events.png)

| Symptom | Cause | Fix |
|---|---|---|
| "Test connection" fails on a card | The key is wrong, the environment is wrong, or the provider has a temporary problem | Re-enter the key and check the Sandbox/Live selection. [Testing integrations](/help/integrations#entegrasyonlari-test-etme) |
| The integration settings are invalid (validation error) | A required field is missing or the format is wrong | Fix the marked fields |
| "The verification signature is invalid." (`invalid_signature`) | The notification's signature does not match (a wrong secret key, or a fake request) | Check the key; ignore it if it comes from a source you do not recognize |
| A job is "Dead (gave up)" | All attempts were used up | Fix the problem and restart the job with **Retry** |
| "Job not found" or the job is already running (`not_found`) | The job has finished or is running | Refresh the page |
| Background jobs do not run at all | The scheduled task ([cron](term:cron)) is off or too infrequent | Verify that cron is defined in the configuration |
| `skipped_no_consent` on a marketing event | The customer did not give cookie consent | Normal. [Analytics](/help/analytics#cerez-onayi) |
| `failed` on a marketing event | The ID or token is wrong | Check the Meta/GA4 card. [Analytics: testing](/help/analytics#test-etme) |
| "An unknown event name was sent." / "Purchase and refund events are generated by the server only; they cannot be sent by hand." (`unknown_event`, `server_only_event`) | An attempt was made to send a purchase/refund event from the browser | The server generates these itself; no action is needed |

The codes come back from the API as in the table; the panel shows most of them with an explanation in plain language.

## FAQ {#sss}

**A change I made in the panel does not appear on the storefront.**
Pages are cached briefly ([cache](term:cache)). Wait 5-10 minutes or hard-refresh the page. The data you see in the panel is always current.

**My store does not show up on Google.**
Turn on the search engine switch in **Settings → SEO**. Then submit the sitemap in Search Console; results can take weeks. [SEO](/help/seo#canonical-ve-noindex).

**I deleted a product; what happens to its orders?**
A product that has been sold is not deleted but archived. If it was never sold, it is deleted permanently.

**Can stock go negative?**
No. If you try to pull it below the reserved amount, you get the warning "Stock cannot go below the reserved quantity" (`stock_below_reserved`). [Stock and the stock ledger](/help/catalog#stok-ve-stok-defteri).

**The image I uploaded was not accepted.**
Only png, jpeg, webp, gif and avif are accepted; SVG is rejected (`unsupported_media_type`); if the file's contents do not match its type you get `mime_mismatch`, and if it is too large you get `payload_too_large`. Convert and shrink the image.

**I get an error when importing products.**
The file must be under 2 MB, the `slug` and `sku` columns must be present, and every row must have a price. [Import](/help/data#ice-aktarma).

**My customer wants their data deleted.**
Use [anonymization](/help/customers-kvkk#kvkk-ve-anonimlestirme); invoices are stored separately, so consult your lawyer.

**Trendyol stock and price are not updating.**
Check that the Trendyol card is enabled and the keys are right; look at the background jobs in **Integration events**. [Trendyol](/help/integrations#trendyol).

**Am I in mock mode, and how can I tell?**
If **Mock inbox** appears in the sidebar, mock mode is on. [Turning off mock mode](/help/going-live#mock-u-kapatma).

**How do I take a backup?**
[Backup](/help/data#yedekleme).

**I cannot tell why my employee cannot see a page.**
Look at the role permissions: [Users and roles](/help/security#kullanicilar-ve-roller).

**Will the store cost money?**
The core system is designed to fit within the free plans for small stores, but this is not a guarantee. [Costs](/help/going-live#maliyetler).

**I still could not solve it.**
Note down the error code, the time, and a screenshot of the **Audit log** / **Integration events**, and ask for support; never share keys or passwords.

## Common mistakes {#sik-yapilan-hatalar}

* Closing an error message without noting the code in it.
* Pressing "Test connection" again and again without re-entering the key.
* Trying again and again when locked out; the time does not extend, but the lock does not lift either, so wait.
* Trying to turn on mock mode on a live site.
* Restarting failed background jobs without looking into them.
