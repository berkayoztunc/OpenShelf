import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import EmailCompose from "../pages/EmailCompose";
import { ApiError } from "../lib/api";
import { describeSendError, unresolvedPlaceholders } from "../lib/mail";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

const PREVIEW = { subject: "Hi", html: "<p>Hello <b>there</b></p>", text: "Hello there", from: "shop@example.com", fromName: "Demo Store", warnings: [] };
const base = (send?: () => unknown) => mockApi({
  "GET /api/admin/emails/templates": () => ({ items: [{ id: "order_paid:en", event: "order_paid", lang: "en", subject: "Order {{orderNumber}}", body: "Hi {{customerName}}", isDefault: true }], variables: [], note: "note" }),
  "GET /api/admin/manual-invoices": () => ({ items: [{ id: "mi1", number: "INV-1", customerName: "Ayse" }], total: 1, page: 1, pageSize: 50 }),
  "POST /api/admin/emails/preview": () => PREVIEW,
  "POST /api/admin/emails$": send ?? (() => ({ id: "e1", status: "sent", provider: "mock", sentAt: "now" })),
});
const mount = (url = "/emails/compose") => renderRoutes({ "/emails/compose": <EmailCompose />, "/emails": <p>sent log</p> }, url);

beforeEach(() => { sessionStorage.clear(); asRole("owner"); withSettings(false); });
afterEach(() => vi.restoreAllMocks());

describe("compose email", () => {
  it("prefills from the query string", async () => {
    base(); mount("/emails/compose?to=a@b.co&orderId=o1&manualInvoiceId=mi1&subject=Your%20order");
    expect(screen.getByLabelText("To")).toHaveValue("a@b.co");
    expect(screen.getByLabelText(/^Subject/)).toHaveValue("Your order");
    await waitFor(() => expect(screen.getByLabelText("Attach invoice link")).toHaveValue("mi1"));
  });

  it("warns about any placeholder other than {{storeName}} and blocks sending", async () => {
    base(); const u = userEvent.setup(); mount("/emails/compose?to=a@b.co");
    await u.type(screen.getByLabelText(/^Subject/), "Hello");
    await u.click(screen.getByLabelText("Body")); await u.paste("Dear {{customerName}}, from {{storeName}}");
    expect(await screen.findByTestId("placeholder-warning")).toHaveTextContent("{{customerName}}");
    expect(screen.getByTestId("placeholder-warning")).not.toHaveTextContent("{{storeName}}");
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(unresolvedPlaceholders("{{storeName}} {{ orderNumber }}", "{{x}}")).toEqual(["orderNumber", "x"]);
  });

  it("renders the server preview inside a fully sandboxed iframe", async () => {
    base(); const u = userEvent.setup(); mount("/emails/compose?to=a@b.co");
    await u.type(screen.getByLabelText(/^Subject/), "Hi"); await u.click(screen.getByLabelText("Body")); await u.paste("Body text");
    const frame = await screen.findByTitle("E-mail preview", undefined, { timeout: 3000 });
    expect(frame).toHaveAttribute("sandbox", "");
    expect(frame).toHaveAttribute("srcdoc", PREVIEW.html);
    expect(screen.getByTestId("preview-from")).toHaveTextContent("Demo Store <shop@example.com>");
  });

  it("confirms, sends and shows the sent state; rate limits and send_failed show clear messages", async () => {
    const u = userEvent.setup();
    let n = 0;
    const m = base(() => { n++; if (n === 1) return new ApiError(429, "rate_limited_recipient", "x"); if (n === 2) return new ApiError(502, "send_failed", "x", { id: "e1", detail: "destination address not verified" }); return { id: "e1", status: "sent", provider: "mock" }; });
    mount("/emails/compose?to=a@b.co&subject=Hi");
    await u.click(screen.getByLabelText("Body")); await u.paste("Hello");
    await u.click(screen.getByRole("button", { name: "Send" }));
    let dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("a@b.co");
    await u.click(within(dlg).getByRole("button", { name: "Send" }));
    expect(await screen.findByText(/already received 5 e-mails today/)).toBeInTheDocument();
    await u.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Retry send" }));
    expect(await screen.findByText(/destination address not verified/)).toBeInTheDocument();
    expect(screen.getByText(/only delivers to verified destination addresses/)).toBeInTheDocument();
    expect(screen.getByLabelText("Body")).toHaveValue("Hello"); // draft survives failures
    dlg = screen.getByRole("dialog");
    await u.click(within(dlg).getByRole("button", { name: "Retry send" }));
    expect((await screen.findAllByText("E-mail sent")).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "View sent log" })).toHaveAttribute("href", "/emails");
    expect(m.post).toHaveBeenCalledWith("/api/admin/emails", expect.objectContaining({ to: "a@b.co", subject: "Hi", body: "Hello" }));
  });

  it("describeSendError maps the documented rate-limit codes", () => {
    expect(describeSendError(new ApiError(429, "rate_limited_admin", "")).message).toMatch(/30 e-mails per hour/);
    expect(describeSendError(new ApiError(429, "rate_limited_total", "")).message).toMatch(/100 e-mails per day/);
    expect(describeSendError(new ApiError(409, "no_email_provider", "")).link?.to).toBe("/integrations");
  });

  it("staff can compose but not send", () => {
    vi.restoreAllMocks(); asRole("staff"); withSettings(false); base(); mount("/emails/compose?to=a@b.co&subject=Hi");
    const send = screen.getByRole("button", { name: "Send" });
    expect(send).toBeDisabled(); expect(send).toHaveAttribute("title", expect.stringMatching(/owners and admins/));
  });

  it("keeps the draft in sessionStorage per tab", async () => {
    base(); const u = userEvent.setup(); const { unmount } = mount();
    await u.type(screen.getByLabelText(/^Subject/), "Keep me"); unmount();
    mount(); expect(screen.getByLabelText(/^Subject/)).toHaveValue("Keep me");
  });
});
