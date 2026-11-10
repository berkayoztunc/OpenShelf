import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Media from "../pages/Media";
import { api } from "../lib/api";
import { setLocale } from "../i18n";
import { asRole, mockApi, renderRoutes } from "./helpers";

const ITEMS = [
  { id: "aaaaaaaa-1", kind: "product", mime: "image/png", size: 250_000, alt: "Mavi vazo", createdAt: "2026-11-10T10:00:00Z", url: "/media/aaaaaaaa-1" },
  { id: "bbbbbbbb-2", kind: "favicon", mime: "image/png", size: 900, alt: null, createdAt: "2026-11-09T10:00:00Z", url: "/media/bbbbbbbb-2", suspect: "very small" },
];
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const setup = (items = ITEMS) => { asRole("owner"); setLocale("tr"); const seen: string[] = []; mockApi({ "GET /api/admin/media": (p) => { seen.push(p); return { items }; } }); return seen; };
beforeEach(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => {}) }, configurable: true }); });
afterEach(() => vi.restoreAllMocks());

describe("Media library page", () => {
  it("lists the images with kind, size and alt text; flags suspiciously small files", async () => {
    setup(); renderRoutes({ "/": <Media /> }, "/");
    expect(await screen.findByText("Mavi vazo")).toBeTruthy();
    expect(screen.getByText(/^244 KB · /)).toBeTruthy(); expect(screen.getByText(/^1 KB · /)).toBeTruthy();
    expect(screen.getByText("Çok küçük dosya")).toBeTruthy();
    expect(screen.getByText("Alt metin ekle")).toBeTruthy();
    expect(screen.getByText("2 dosya")).toBeTruthy();
  });
  it("uploads several files in one go with the chosen kind and alt text; shows fit warnings and failures", async () => {
    setup();
    const up = vi.spyOn(api, "upload").mockImplementation(async (_p, form) => {
      const f = (form as FormData).get("file") as File;
      if (f.name === "bad.png") throw new Error("Only png, jpeg, webp, gif and avif images are allowed");
      return { id: `id-${f.name}`, url: "/media/x", mime: "image/png", size: 3, width: 1000, height: 1000, warnings: ["Aspect ratio is 1:1, expected about 4:5"] } as never;
    });
    const u = userEvent.setup(); renderRoutes({ "/": <Media /> }, "/");
    await screen.findByText("Mavi vazo");
    await u.selectOptions(screen.getByLabelText("Ne için?"), "banner");
    await u.type(screen.getByLabelText("Alt metin (isteğe bağlı)"), "Yaz kampanyası");
    await u.upload(screen.getByLabelText("Dosya seç", { selector: "input" }), [png("a.png"), png("b.png"), png("bad.png")]);
    await waitFor(() => expect(up).toHaveBeenCalledTimes(3));
    const forms = up.mock.calls.map((c) => c[1] as FormData);
    expect(forms.every((f) => f.get("kind") === "banner" && f.get("alt") === "Yaz kampanyası")).toBe(true);
    expect((await screen.findAllByText(/Aspect ratio is 1:1/)).length).toBe(2);
    expect(await screen.findByRole("alert")).toHaveTextContent("Only png, jpeg");
    expect(screen.getAllByText("Yüklendi", { exact: false }).length).toBeGreaterThanOrEqual(2);
  });
  it("ignores non-image files and accepts images pasted from the clipboard", async () => {
    setup(); const up = vi.spyOn(api, "upload").mockResolvedValue({ id: "p1", url: "/media/p1", mime: "image/png", size: 3 } as never);
    renderRoutes({ "/": <Media /> }, "/"); await screen.findByText("Mavi vazo");
    fireEvent.paste(document.body, { clipboardData: { files: [new File(["x"], "notes.txt", { type: "text/plain" })] } });
    expect(up).not.toHaveBeenCalled();
    fireEvent.paste(document.body, { clipboardData: { files: [png("shot.png")] } });
    await waitFor(() => expect(up).toHaveBeenCalledTimes(1));
    expect((up.mock.calls[0]![1] as FormData).get("kind")).toBe("product");
  });
  it("edits alt text in place (Enter saves, Esc cancels) and copies the id", async () => {
    setup(); const patch = vi.spyOn(api, "patch").mockResolvedValue({} as never);
    const u = userEvent.setup(); renderRoutes({ "/": <Media /> }, "/");
    await u.click(await screen.findByRole("button", { name: "aaaaaaaa kimlikli görselin alt metnini düzenle" }));
    const box = screen.getByRole("textbox", { name: "aaaaaaaa kimlikli görselin alt metnini düzenle" });
    await u.clear(box); await u.type(box, "Yeşil vazo{Enter}");
    await waitFor(() => expect(patch).toHaveBeenCalledWith("/api/admin/media/aaaaaaaa-1", { alt: "Yeşil vazo" }));
    await u.click(screen.getByRole("button", { name: "bbbbbbbb kimlikli görselin alt metnini düzenle" })); await u.keyboard("x{Escape}");
    expect(patch).toHaveBeenCalledTimes(1);
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    await u.click(screen.getAllByRole("button", { name: "Kimliği kopyala" })[0]!);
    expect(write).toHaveBeenCalledWith("aaaaaaaa-1");
  });
  it("delete asks first, explains the consequence, then removes only that file", async () => {
    setup(); const del = vi.spyOn(api, "del").mockResolvedValue(undefined as never);
    const u = userEvent.setup(); renderRoutes({ "/": <Media /> }, "/");
    await u.click((await screen.findAllByRole("button", { name: "Sil" }))[0]!);
    const dlg = await screen.findByRole("dialog");
    expect(dlg).toHaveTextContent("geri alınamaz"); expect(del).not.toHaveBeenCalled();
    await u.click(within(dlg).getByRole("button", { name: "Sil" }));
    await waitFor(() => expect(del).toHaveBeenCalledWith("/api/admin/media/aaaaaaaa-1"));
  });
  it("filters the library by type and shows an empty state", async () => {
    const seen = setup([]); const u = userEvent.setup(); renderRoutes({ "/": <Media /> }, "/");
    expect(await screen.findByText("Henüz dosya yok")).toBeTruthy();
    await u.selectOptions(screen.getByLabelText("Tür"), "logo");
    await waitFor(() => expect(seen.at(-1)).toContain("kind=logo"));
    expect(seen[0]).toContain("limit=200");
  });
});
