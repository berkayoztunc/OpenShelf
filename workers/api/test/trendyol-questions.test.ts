import { describe, expect, it } from "vitest";
import { parseQuestions, questionEmail, questionKey, stagesFor } from "../src/lib/trendyolQuestions";

const H = 3600_000;
const now = Date.UTC(2026, 10, 18, 12);

describe("trendyol question reminder", () => {
  it("first mail when new, second once fewer than 6 hours are left; dedupe key per stage", () => {
    expect(stagesFor({ id: "1", text: "", productName: "", createdAt: now - 2 * H }, now)).toEqual(["new"]);
    expect(stagesFor({ id: "1", text: "", productName: "", createdAt: now - 19 * H }, now)).toEqual(["due"]);
    expect(questionKey("42", "new")).not.toBe(questionKey("42", "due"));
  });
  it("parses Trendyol question pages and skips malformed rows", () => {
    const rows = parseQuestions({ content: [
      { id: 7, text: "Bu vazo kaç cm?", productName: "Seramik Vazo", creationDate: now - H, webUrl: "https://www.trendyol.com/x-p-1" },
      { id: "bad" }, { text: "no id", creationDate: 1 },
    ] });
    expect(rows).toEqual([{ id: "7", text: "Bu vazo kaç cm?", productName: "Seramik Vazo", createdAt: now - H, webUrl: "https://www.trendyol.com/x-p-1" }]);
    expect(parseQuestions(null)).toEqual([]);
    expect(parseQuestions({ content: "x" })).toEqual([]);
  });
  it("builds the admin e-mail with time left and escapes customer text", () => {
    const m = questionEmail({ id: "7", text: "<script>x</script> fiyat?", productName: "Vazo & Tabak", createdAt: now - 20 * H, stage: "due" }, now, { storeName: "Atölye", adminUrl: "https://shop.test/admin/trendyol/questions" });
    expect(m.subject).toBe("[Trendyol] Cevap süresi doluyor (4 saat kaldı): Vazo & Tabak");
    expect(m.html).toContain("&lt;script&gt;x&lt;/script&gt;");
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("Vazo &amp; Tabak");
    expect(m.text).toContain("Cevaplamak için: https://shop.test/admin/trendyol/questions");
    const n = questionEmail({ id: "8", text: "Stok var mı?", productName: "Örtü", createdAt: now, stage: "new" }, now, { storeName: "Atölye", adminUrl: null });
    expect(n.subject).toBe("[Trendyol] Yeni müşteri sorusu: Örtü");
    expect(n.text).not.toContain("Cevaplamak için");
  });
});
