import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Categories from "../pages/Categories";
import { api } from "../lib/api";
import { setLocale } from "../i18n";
import { asRole, renderRoutes } from "./helpers";

const ROW = { id: "c1", slug: "vazo", nameTr: "Vazolar", parentId: null, position: 0, descriptionTr: "Eski açıklama", descriptionEn: "", imageMediaId: "m-old", seoTitle: null, seoDescription: null, seoOgImageUrl: null, seoNoindex: false };
beforeEach(() => { asRole("owner"); setLocale("tr"); vi.spyOn(api, "get").mockResolvedValue({ items: [ROW] } as never); });
afterEach(() => vi.restoreAllMocks());

describe("category form: description and card photo", () => {
  it("loads the description and the photo, and a plain edit sends them back unchanged (nothing is wiped)", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({} as never); const u = userEvent.setup();
    renderRoutes({ "/": <Categories /> }, "/");
    await u.click(await screen.findByRole("button", { name: "Düzenle" }));
    const dlg = await screen.findByRole("dialog");
    expect((within(dlg).getByLabelText("Açıklama") as HTMLTextAreaElement).value).toBe("Eski açıklama");
    expect(within(dlg).getByAltText(/Kategori kartı görseli/)).toBeTruthy();
    await u.click(within(dlg).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![0]).toBe("/api/admin/categories/c1");
    expect(put.mock.calls[0]![1]).toMatchObject({ slug: "vazo", nameTr: "Vazolar", descriptionTr: "Eski açıklama", descriptionEn: null, imageMediaId: "m-old" });
  });
  it("editing the description and removing the photo are saved; an empty description is sent as null", async () => {
    const put = vi.spyOn(api, "put").mockResolvedValue({} as never); const u = userEvent.setup();
    renderRoutes({ "/": <Categories /> }, "/");
    await u.click(await screen.findByRole("button", { name: "Düzenle" }));
    const dlg = await screen.findByRole("dialog");
    const desc = within(dlg).getByLabelText("Açıklama"); await u.clear(desc); await u.type(desc, "Yeni açıklama");
    await u.type(within(dlg).getByLabelText("İngilizce açıklama (isteğe bağlı)"), "New description");
    await u.click(within(dlg).getByRole("button", { name: /Kaldır|Remove/ }));
    await u.click(within(dlg).getByRole("button", { name: /Kaydet/ }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls[0]![1]).toMatchObject({ descriptionTr: "Yeni açıklama", descriptionEn: "New description", imageMediaId: null });
  });
});
