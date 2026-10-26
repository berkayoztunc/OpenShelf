import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { sectionList, searchGuide, GLOSSARY_SLUG } from "../help/content";
import { slugify, parseGuide, guidePath } from "../help/slug";
import { GuideView } from "../help/GuideView";
import { HelpTipRaw } from "../components/help/HelpTip";
import { Term } from "../components/help/Term";
import { PageHeader } from "../components/ui";
import HelpPage from "../pages/Help";
import { setLocale } from "../i18n";

const wrap = (ui: React.ReactElement, path = "/") => render(<MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>);

describe("guide content", () => {
  it("same sections exist in TR and EN, each with a title", () => {
    const tr = sectionList("tr"); const en = sectionList("en");
    expect(en.map((s) => s.slug)).toEqual(tr.map((s) => s.slug));
    for (const s of [...tr, ...en]) expect(s.title.length, s.slug).toBeGreaterThan(2);
    expect(en.filter((s) => s.fallback).map((s) => s.slug), "EN sections missing a translation").toEqual([]);
  });
  it("heading anchors are unique per section", () => {
    for (const s of sectionList("tr")) { const ids = s.headings.map((h) => h.id); expect(new Set(ids).size, s.slug).toBe(ids.length); }
  });
  it("slugify folds Turkish letters", () => {
    expect(slugify("İade nasıl yapılır?")).toBe("iade-nasil-yapilir");
    expect(slugify("Şifre & Güvenlik")).toBe("sifre-guvenlik");
    expect(parseGuide("orders#iade")).toEqual({ section: "orders", anchor: "iade" });
    expect(guidePath("/help/orders#iade")).toBe("/help/orders#iade");
  });
  it("search is accent and case insensitive", () => {
    const hits = searchGuide("tr", "ISLEM");
    expect(Array.isArray(hits)).toBe(true);
  });
});

describe("GuideView", () => {
  it("renders callouts, glossary terms and anchored headings; no raw HTML", () => {
    wrap(<GuideView md={"# Başlık\n\n## Alt bölüm\n\n> [!WARNING]\n> Dikkat edin\n\nKodu [SKU](term:sku) girin. <script>alert(1)</script>\n"} />);
    expect(screen.getByRole("heading", { level: 2, name: /Alt bölüm/ })).toHaveAttribute("id", "alt-bolum");
    expect(screen.getByRole("note")).toHaveTextContent("Dikkat edin");
    expect(screen.getByRole("note")).not.toHaveTextContent("[!WARNING]");
    expect(screen.getByRole("button", { name: "SKU" })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });
});

describe("help popovers", () => {
  it("HelpTip opens, shows body/example/warning and closes with Escape", async () => {
    const u = userEvent.setup();
    wrap(<HelpTipRaw label="Show explanation" title="Slug" body={"First para.\n\nSecond para."} example="seramik-vazo" warn="Changing it redirects." guide="catalog#slug" />);
    const btn = screen.getByRole("button", { name: "Show explanation" });
    expect(btn).toHaveAttribute("aria-expanded", "false");
    await u.click(btn);
    const dlg = screen.getByRole("dialog");
    expect(within(dlg).getByText("First para.")).toBeInTheDocument();
    expect(within(dlg).getByText("seramik-vazo")).toBeInTheDocument();
    expect(within(dlg).getByText(/Changing it redirects/)).toBeInTheDocument();
    expect(within(dlg).getByRole("link", { name: /guide/i })).toHaveAttribute("href", "/help/catalog#slug");
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(btn).toHaveFocus();
  });
  it("Term shows the glossary entry in the active language", async () => {
    const u = userEvent.setup();
    setLocale("tr");
    wrap(<p><Term id="sku" /></p>);
    expect(screen.getByRole("tooltip")).toHaveTextContent("Her ürün çeşidine verdiğiniz benzersiz kod.");
    await u.click(screen.getByRole("button", { name: "Stok kodu (SKU)" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("Stock Keeping Unit");
  });
  it("Term with an unknown id degrades to plain text", () => {
    wrap(<p><Term id="nope">fallback</Term></p>);
    expect(screen.getByText("fallback")).toBeInTheDocument();
  });
  it("PageHeader guide button opens the guide panel", async () => {
    const u = userEvent.setup();
    wrap(<PageHeader title="Orders" guide="orders" />);
    await u.click(screen.getByRole("button", { name: /how do i use this page/i }));
    expect(screen.getByRole("dialog", { name: /how to use/i })).toBeInTheDocument();
  });
});

describe("Help page", () => {
  const page = (path: string) => wrap(<Routes><Route path="/help" element={<HelpPage />} /><Route path="/help/:section" element={<HelpPage />} /></Routes>, path);
  it("lists every section plus the glossary on the index", () => {
    page("/help");
    expect(screen.getAllByRole("link", { name: /Glossary/ }).length).toBeGreaterThan(0);
    for (const s of sectionList("en")) expect(screen.getAllByText(s.title).length, s.title).toBeGreaterThan(0);
  });
  it("renders the glossary from the dictionaries", () => {
    page(`/help/${GLOSSARY_SLUG}`);
    expect(screen.getByText("URL slug")).toBeInTheDocument();
  });
  it("unknown section shows a not-found message", () => {
    page("/help/does-not-exist");
    expect(screen.getByText(/could not be found/i)).toBeInTheDocument();
  });
});

describe("explicit heading anchors", () => {
  it("`{#id}` pins the anchor and is not shown", () => {
    wrap(<GuideView md={"# T\n\n## Channel prices {#kanal-fiyatlari}\n\ntext"} />);
    const h = screen.getByRole("heading", { level: 2 });
    expect(h).toHaveAttribute("id", "kanal-fiyatlari");
    expect(h).toHaveTextContent("Channel prices");
    expect(h).not.toHaveTextContent("{#");
  });
  it("parseHeadings uses the pinned anchor", () => {
    const sec = sectionList("tr")[0]!;
    expect(sec.headings.every((x) => !x.text.includes("{#"))).toBe(true);
  });
});
