import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import System from "../pages/settings/System";
import { asRole, mockApi, renderRoutes, withSettings } from "./helpers";

describe("settings: factory reset", () => {
  it("owner: confirm stays disabled until the word and password are given, then posts both", async () => {
    asRole("owner"); withSettings(false);
    const posts: unknown[] = [];
    mockApi({ "GET /api/admin/mock/status": () => ({ allowed: true, reason: null }), "POST /api/admin/system/reset": (_p, b) => { posts.push(b); return { ok: true }; } });
    const u = userEvent.setup(); renderRoutes({ "/": <System /> }, "/");
    await u.click(await screen.findByRole("button", { name: /Reset everything|Her şeyi sıfırla/ }));
    const dlg = await screen.findByRole("dialog");
    const go = within(dlg).getByRole("button", { name: /Delete everything|Her şeyi sil/ });
    expect(go).toBeDisabled();
    await u.type(within(dlg).getByLabelText(/Type SIFIRLA|SIFIRLA yazın/), "SIFIRLA");
    expect(go).toBeDisabled();
    await u.type(within(dlg).getByLabelText(/Your password|Şifreniz/), "pw");
    expect(go).toBeEnabled();
    await u.click(go);
    expect(posts).toEqual([{ confirm: "SIFIRLA", password: "pw" }]);
  });
  it("non-owner does not see the danger zone", async () => {
    asRole("admin"); withSettings(false);
    mockApi({ "GET /api/admin/mock/status": () => ({ allowed: true, reason: null }) });
    renderRoutes({ "/": <System /> }, "/");
    await screen.findByTestId("mock-status");
    expect(screen.queryByRole("button", { name: /Reset everything|Her şeyi sıfırla/ })).toBeNull();
  });
});
