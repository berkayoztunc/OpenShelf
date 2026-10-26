import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MfaBanner } from "../components/Layout";
import * as auth from "../lib/auth";
import { vi } from "vitest";

const admin = (extra: object) => ({ id: "1", email: "a@b.c", name: "A", role: "owner" as const, totpEnabled: false, ...extra });
const show = (a: object | null) => { vi.spyOn(auth, "useAdmin").mockReturnValue(a as never); return render(<MemoryRouter><MfaBanner /></MemoryRouter>); };

describe("MFA enrollment banner", () => {
  it("shows a link to /security when enrollment is required", () => {
    show(admin({ mfaEnrollmentRequired: true }));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/security");
  });
  it("is hidden otherwise", () => {
    show(admin({ mfaEnrollmentRequired: false }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("admin _headers", () => {
  const h = readFileSync(resolve(process.cwd(), "public/_headers"), "utf8");
  it("denies framing, sniffing and tracking scripts", () => {
    expect(h).toContain("frame-ancestors 'none'");
    expect(h).toContain("X-Content-Type-Options: nosniff");
    expect(h).toContain("Referrer-Policy: no-referrer");
    expect(h).toContain("Strict-Transport-Security");
    expect(h).toMatch(/script-src 'self';/);
    expect(h).not.toMatch(/googletagmanager|google-analytics|facebook/);
  });
});
