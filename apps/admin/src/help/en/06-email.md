# Composing e-mail

In this section you will learn how to send a customer an e-mail you have written yourself from the panel (for example about a shipping delay, an apology, or sending an invoice): the compose screen, ready-made templates, hourly/daily sending limits and the sent log. This feature is separate from the notifications that go out **automatically** according to order status (see [Notifications](/help/store-settings#bildirimler)); here we are talking about messages written by hand, one at a time.

> [!NOTE]
> The e-mail composer relies on the Cloudflare Email service, which is in **Beta**. The service itself, your plan and its behaviour may change; it has not been verified against a live account. Before writing to real customers, send a test to your own address.

## Writing an e-mail {#e-posta-yazma}

Click **Emails** in the left menu, then **Compose email** at the top right (or use **Email customer** on the order page, or **Email to customer** on an issued invoice, and the recipient and subject come ready-filled).

![E-mail compose screen](help/en/emails-compose.png)

> [!WARNING]
> **Sending** e-mail is an **Admin** and **Owner** permission only. The Staff role can view the records, but the **Send** button is disabled ("Only owners and admins can send e-mail").

### Prerequisite {#on-kosul}

To send, **Cloudflare Email** must be on and configured on the **Integrations** screen ([Cloudflare Email](/help/integrations#cloudflare-e-posta)). Otherwise you will get a "No e-mail provider is enabled" error. In mock mode, e-mails are not really sent; they are written to the **Mock inbox**.

### Sending an e-mail, step by step {#adim-adim-e-posta-gonderme}

1. **Emails** → **Compose email**.
2. On the **Message** card, type the e-mail address in the **To** field, or type at least 2 letters to pick one of your saved customers. (Anonymised customers do not appear in the list.)
3. If you like, fill in the **Cc** and **Reply-To** fields. If Reply-To is empty, the customer's reply goes to the store address.
4. Write the **Subject** (at most 200 characters, no line breaks; a counter is shown below it).
5. Write the message in the **Body** field. Formatting:
   - Leaving a blank line starts a new paragraph.
   - If you write `**bold**` it appears in bold (or use the **Bold** button).
   - Only links starting with `https://` become clickable; the **Link** button helps you add an address.
   - The **`{{storeName}}`** button inserts your store name.
   - You cannot write HTML; everything you write is treated as plain text and safely converted to HTML.
6. On the **Preview** card on the right, see the real e-mail. The preview and the e-mail that is sent are exactly the same.
7. If needed, choose an issued manual invoice from the **Attach invoice link** list: the invoice's PDF link is added at the end of the message.
8. Press **Send** at the top right and confirm in the **Send this e-mail?** window that opens.
9. If it succeeds, the status becomes **Sent** and it is added to the **Sent log**. If it fails, the error is shown and a **Retry send** option is offered.

The **Send** button does not become active until the recipient, subject and body are valid and no unresolved placeholder remains.

### Why can't the sender (From) be changed? {#gonderen-from-neden-degistirilemez}

The sender address is **not on the compose screen** and cannot be changed. The system uses:

1. **Settings → Notifications → From e-mail** (if set)
2. **Settings → General → Contact email**.

The sender name: **Notifications → From name**, or, if empty, the **Store name**. This is a deliberate safety rule: e-mail cannot be sent through the panel under someone else's address (a spoofed sender). The sender's domain must be verified in Cloudflare Email Sending; otherwise the provider rejects the e-mail.

### Which placeholders work? {#hangi-yer-tutucular-calisir}

When composing an e-mail, **only `{{storeName}}`** is filled in automatically. Other template variables such as `{{orderNumber}}` and `{{customerName}}` are **not filled in** on this screen; you need to replace them by hand with the real value. If an unresolved placeholder remains:

- The preview shows a yellow warning ("Placeholder `{{orderNumber}}` is not replaced").
- The send is rejected ("The message still contains `{{placeholders}}` that cannot be filled in…").

This rule stops a message like "Dear {{customerName}}" from going to a customer by mistake.

### Common mistakes {#sik-yapilan-hatalar}

- **Applying a template and not replacing the placeholders.** The send is rejected; write the `{{…}}` parts by hand.
- **Writing HTML:** HTML tags appear as plain text.
- **Expecting to send to everyone on the Cloudflare Free plan.** On the Free plan, delivery is only to verified destination addresses; sends to other addresses are rejected by the provider.
- **Not verifying the sender domain.** The send fails and the error is shown in the **Sent log**.
- **Putting a line break in the subject:** The subject must be a single line.
- **Sharing customer details unnecessarily.** Write messages containing personal data ([KVKK](term:kvkk), Turkish data protection law) with care.

## Templates {#sablonlar}

Instead of writing from scratch every time, you can use the templates you prepared for automatic notifications as a starting point.

1. On the compose screen, find the **Templates and attachments** card.
2. Choose an event from the **Template event** list (order paid, order shipped, order delivered, order cancelled, order refunded, new order).
3. Choose the **Language** (Turkish/English).
4. Click **Apply template**. The subject and body are filled with the template, and a "Template applied - replace any {{placeholders}} before sending" notice appears.
5. Personalise the message: replace variables such as `{{orderNumber}}`, `{{customerName}}`, `{{total}}`, `{{trackingNumber}}`, `{{trackingUrl}}` and `{{orderUrl}}` with real details (**only** `{{storeName}}` fills in on its own).

The templates themselves are edited on the **Settings → Notifications → Templates** card. Templates you leave empty there fall back to the built-in default; the compose screen also pulls in these current templates.

### Example {#ornek}

You want to tell the customer Jane Smith that her order **DEMO-1004** will be late:

```
Subject: About your order DEMO-1004

Hello Jane,

Your order DEMO-1004 (Ceramic Vase) will be delayed by 2 business days due to high production volume. Thank you for your understanding.

{{storeName}}
```

Since only `{{storeName}}` remains before sending, the system fills it in with your store name; the message can be sent.

## Sending limits {#gonderim-limitleri}

To prevent your account from being abused (spam sent from a compromised account) and unexpected cost, three limits are applied to the e-mail composer. The limits apply to all send attempts:

| Limit | Value | Scope | Message shown when exceeded |
|---|---|---|---|
| **Per admin** | **30 per hour** | Each admin account has its own counter | "Sending limit reached: 30 e-mails per hour per admin. Try again later." |
| **Store-wide** | **100 per day** | The total across all admins | "Daily sending limit reached: 100 e-mails per day for the whole store. Try again tomorrow." |
| **Per recipient** | **5 per day** | The same recipient address | "This recipient already received 5 e-mails today. Try again tomorrow." |

When a limit is exceeded, a waiting time is reported; you can try again once it has passed. Resending a failed e-mail also counts towards the limit.

> [!NOTE]
> These limits are only for e-mails written **by hand** from the panel. Notifications that go out automatically with orders have separate rules: the daily e-mail limit per recipient on the **Notifications** tab (5 by default) and the SMS limit (3 by default).

### Why are the limits so low? {#sinirlar-neden-bu-kadar-dusuk}

This is an e-commerce store, not a newsletter tool. It is not suitable for marketing or bulk e-mail (OpenShelf does not send bulk e-mail). The provider may also apply its own limits; Cloudflare Email is in Beta and its pricing/limits may change.

## Sent log {#gonderilenler}

Every e-mail sent from the panel is listed on the **Emails** page. (Order notifications are not in this list; they appear on the relevant order's **Notifications** card.)

![Sent e-mails list](help/en/emails-sent.png)

| Item | Description |
|---|---|
| **Status** filter | **All**, **Queued**, **Sent**, **Failed** |
| **Search** | Searches by recipient or subject |
| Columns | **Time**, **Recipient**, **Subject**, **Linked** (the linked order/invoice), **Status** |

Clicking a row opens a detail window: the status, the provider used, the error message if any, and the full content of the e-mail that was sent.

### Resending a failed e-mail {#basarisiz-e-postayi-tekrar-gonderme}

1. Click an e-mail in the **Failed** status.
2. Read the error message (for example "sender domain not verified", "recipient address is not a verified destination").
3. Fix the cause (domain verification, plan, spelling of the address).
4. Press **Resend** at the bottom of the window. Only failed e-mails can be resent; this also counts towards the sending limits. Permission: Admin and Owner.

### Common mistakes {#sik-yapilan-hatalar-1}

- **"Sent" does not mean it reached the recipient.** It shows that the provider accepted the message. Deliverability (spam folder and so on) depends on your domain's SPF/DKIM/DMARC setup.
- **Ignoring a failed e-mail:** A refund/apology message that never reached the customer costs you reputation; check the **Failed** filter regularly.
