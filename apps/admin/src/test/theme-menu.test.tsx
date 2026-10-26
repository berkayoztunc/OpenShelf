import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeMenu } from "../components/ThemeMenu";
import { getThemeMode, initThemeMode } from "@openshelf/ui";

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-theme"); });

describe("ThemeMenu (System / Light / Dark)", () => {
  it("defaults to system and offers three radio options", async () => {
    const u = userEvent.setup(); render(<ThemeMenu />);
    expect(screen.getByTestId("theme-trigger")).toHaveAccessibleName("Theme: System");
    await u.click(screen.getByTestId("theme-trigger"));
    expect(screen.getAllByRole("menuitemradio").map((e) => e.textContent)).toEqual(["System", "Light", "Dark"]);
    expect(screen.getByRole("menuitemradio", { name: "System" })).toHaveAttribute("aria-checked", "true");
  });
  it("applies and persists dark, then light, then system", async () => {
    const u = userEvent.setup(); render(<ThemeMenu />);
    for (const [name, attr] of [["Dark", "dark"], ["Light", "light"], ["System", null]] as const) {
      await u.click(screen.getByTestId("theme-trigger"));
      await u.click(screen.getByRole("menuitemradio", { name }));
      expect(document.documentElement.getAttribute("data-theme")).toBe(attr);
      expect(getThemeMode()).toBe(name.toLowerCase());
    }
  });
  it("Esc closes the menu and returns focus to the trigger; init restores the stored mode", async () => {
    const u = userEvent.setup(); render(<ThemeMenu />);
    await u.click(screen.getByTestId("theme-trigger"));
    await u.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("theme-trigger")).toHaveFocus();
    localStorage.setItem("os-theme", "dark"); initThemeMode();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
