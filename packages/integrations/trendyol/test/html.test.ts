import { describe, expect, it } from "vitest";
import { htmlToText, looksLikeHtml, mapContent } from "../src";

describe("htmlToText", () => {
  it("turns Trendyol HTML into plain text with line breaks and bullets", () => {
    const html = '<p>Yumuşak <b>pamuklu</b> tişört.</p><ul><li>%100 pamuk</li><li>Yıkanabilir&nbsp;30°</li></ul><br/>Marka &amp; Co &#39;s &quot;best&quot;<script>alert(1)</script>';
    expect(htmlToText(html)).toBe("Yumuşak pamuklu tişört.\n\n• %100 pamuk\n• Yıkanabilir 30°\n\nMarka & Co 's \"best\"");
  });
  it("never leaves markup behind (incl. truncated tags, comments, style)", () => {
    const out = htmlToText('<style>.a{}</style><!-- x --><div class="a">Hi<img src=x onerror=1></div><span');
    expect(out).toBe("Hi");
    expect(htmlToText("<p>a &lt;b&gt; c</p>")).toBe("a <b> c"); // decoded entities are text, not markup
  });
  it("keeps plain text unchanged and handles empty input", () => {
    expect(htmlToText("Düz metin\nikinci satır")).toBe("Düz metin\nikinci satır");
    expect(htmlToText(undefined)).toBe("");
    expect(htmlToText("")).toBe("");
  });
  it("detects leftover HTML", () => {
    expect(looksLikeHtml("<p>x</p>")).toBe(true);
    expect(looksLikeHtml("a &nbsp; b")).toBe(true);
    expect(looksLikeHtml("plain 5 < 6")).toBe(false);
  });
  it("mapContent strips HTML from the description", () => {
    expect(mapContent({ contentId: 1, title: "t", description: "<p>Merhaba<br>dünya</p>", variants: [] }).description).toBe("Merhaba\ndünya");
  });
});
