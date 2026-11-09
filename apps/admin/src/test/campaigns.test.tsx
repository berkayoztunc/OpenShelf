import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignEditor, CampaignList } from "../pages/Campaigns";
import Sms from "../pages/Sms";
import { progressOf, smsSegments } from "../lib/campaigns";
import { asRole, mockApi, renderRoutes } from "./helpers";

const AUD = { count: 12, truncated: false, max: 5000, sample: [{ name: "A", to: "a***@example.com" }] };

describe("sms segments", () => {
  it("counts GSM vs unicode (Turkish) segments", () => {
    expect(smsSegments("")).toEqual({ chars: 0, segments: 0, unicode: false });
    expect(smsSegments("a".repeat(160))).toMatchObject({ segments: 1, unicode: false });
    expect(smsSegments("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(smsSegments("şeker")).toMatchObject({ unicode: true, segments: 1 });
    expect(smsSegments("ş".repeat(71))).toMatchObject({ unicode: true, segments: 2 });
  });
  it("progress percentage", () => { expect(progressOf({ total: 10, sent: 5, failed: 1, skipped: 2 })).toBe(80); expect(progressOf({ total: 0, sent: 0, failed: 0, skipped: 0 })).toBe(0); });
});

describe("campaigns UI", () => {
  it("list shows campaigns with progress; staff is blocked", async () => {
    asRole("admin");
    mockApi({ "GET /api/admin/campaigns": () => ({ items: [{ id: "c1", name: "Yaz", channel: "email", status: "sending", total: 10, sent: 4, failed: 1, skipped: 0, createdAt: 1767000000 }], total: 1, page: 1, pageSize: 20 }) });
    renderRoutes({ "/": <CampaignList /> }, "/");
    expect(await screen.findByRole("link", { name: "Yaz" })).toHaveAttribute("href", "/campaigns/c1");
    expect(screen.getByText("4/10 · 1 ✗")).toBeInTheDocument();
  });
  it("staff cannot use campaigns", async () => {
    asRole("staff"); mockApi({});
    renderRoutes({ "/": <CampaignList /> }, "/");
    expect(await screen.findByText(/Admins only|Yalnızca yöneticiler/)).toBeInTheDocument();
  });

  it("new campaign: shows audience count, SMS counter, saves then sends after confirmation", async () => {
    asRole("owner");
    const calls: string[] = [];
    mockApi({
      "POST /api/admin/campaigns/audience": () => AUD,
      "POST /api/admin/campaigns": (_p, b) => { calls.push("create:" + (b as any).channel); return { id: "c9" }; },
      "PUT /api/admin/campaigns/c9": () => ({ id: "c9" }),
      "POST /api/admin/campaigns/c9/send": () => { calls.push("send"); return { status: "sending" }; },
    });
    const u = userEvent.setup(); renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/new");
    await waitFor(() => expect(screen.getByTestId("audience")).toHaveTextContent("12"));
    const send = screen.getByRole("button", { name: /Send campaign|Kampanyayı gönder/ });
    expect(send).toBeDisabled(); // nothing written yet
    await u.type(screen.getByLabelText(/Campaign name|Kampanya adı/), "Yaz");
    await u.type(screen.getByLabelText(/^Subject|^Konu/), "Merhaba");
    await u.type(screen.getByLabelText(/^Message|^Mesaj/), "İndirim");
    expect(send).toBeEnabled();
    await u.click(send);
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("12");
    await u.click(within(dlg).getByRole("button", { name: /Send now|Şimdi gönder/ }));
    await waitFor(() => expect(calls).toEqual(["create:email", "send"]));
  });

  it("running campaign shows progress, failures and a cancel button", async () => {
    asRole("admin");
    mockApi({
      "POST /api/admin/campaigns/audience": () => AUD,
      "GET /api/admin/campaigns/c1": () => ({ id: "c1", name: "Yaz", channel: "sms", body: "Selam", subject: null, filters: {}, status: "sending", total: 10, sent: 4, failed: 1, skipped: 1, pending: 4, createdAt: 1767000000, problems: [{ id: "r1", to: "+90***33", status: "failed", error: "rejected" }] }),
    });
    renderRoutes({ "/campaigns/:id": <CampaignEditor /> }, "/campaigns/c1");
    expect(await screen.findByTestId("campaign-progress")).toHaveTextContent("4/10");
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel sending|Göndermeyi iptal et/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send campaign|Kampanyayı gönder/ })).toBeNull(); // locked once sent
  });
});

describe("single SMS page", () => {
  it("sends one SMS and lists history", async () => {
    asRole("admin");
    const posts: unknown[] = [];
    mockApi({ "GET /api/admin/sms": () => ({ items: [{ id: "s1", to: "+90***33", text: "Selam", status: "sent", createdAt: 1767000000 }], total: 1, page: 1, pageSize: 20 }), "POST /api/admin/sms/send": (_p, b) => { posts.push(b); return { id: "s2" }; } });
    const u = userEvent.setup(); renderRoutes({ "/": <Sms /> }, "/");
    expect(await screen.findByText("Selam")).toBeInTheDocument();
    await u.type(screen.getByLabelText(/Phone number|Telefon numarası/), "05301234567");
    await u.type(screen.getAllByLabelText(/^Message|^Mesaj/)[0]!, "Merhaba");
    await u.click(screen.getByRole("button", { name: /^Send SMS|^SMS gönder/ }));
    await waitFor(() => expect(posts).toEqual([{ to: "05301234567", text: "Merhaba" }]));
  });
});
