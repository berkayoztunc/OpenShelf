import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { buildSecretsPayload } from "../lib/secrets";
import type { SecretState } from "../lib/secrets";
import { SecretField } from "../components/SecretField";

describe("buildSecretsPayload", () => {
  it("omits kept/empty, sends set values, null for clear", () => {
    expect(buildSecretsPayload({ a: { mode: "keep", value: "" }, b: { mode: "set", value: "" }, c: { mode: "set", value: "s3" }, d: { mode: "clear", value: "" } })).toEqual({ c: "s3", d: null });
    expect(buildSecretsPayload({ a: { mode: "keep", value: "" } })).toBeUndefined();
  });
});

function Harness({ isSet = true, onState }: { isSet?: boolean; onState?: (s: SecretState) => void }) {
  const [s, setS] = useState<SecretState>({ mode: "keep", value: "" });
  onState?.(s);
  return <SecretField label="API key" isSet={isSet} masked="••••1234" state={s} onChange={setS} />;
}

describe("SecretField", () => {
  it("shows only the mask, never an editable stored value", () => {
    render(<Harness />);
    const input = screen.getByLabelText(/API key \(set, hidden\)/) as HTMLInputElement;
    expect(input.value).toBe("••••1234");
    expect(input).toBeDisabled();
  });
  it("Change reveals an empty password input; Cancel returns to keep", async () => {
    const u = userEvent.setup(); const spy = vi.fn();
    render(<Harness onState={spy} />);
    await u.click(screen.getByRole("button", { name: "Change" }));
    const input = screen.getByLabelText("API key") as HTMLInputElement;
    expect(input.type).toBe("password"); expect(input.value).toBe("");
    await u.type(input, "newsecret");
    expect(spy).toHaveBeenLastCalledWith({ mode: "set", value: "newsecret" });
    await u.click(screen.getByRole("button", { name: "Cancel" }));
    expect(spy).toHaveBeenLastCalledWith({ mode: "keep", value: "" });
  });
  it("Clear marks for removal and can be undone", async () => {
    const u = userEvent.setup(); const spy = vi.fn();
    render(<Harness onState={spy} />);
    await u.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.getByText(/will be removed/)).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Undo" }));
    expect(spy).toHaveBeenLastCalledWith({ mode: "keep", value: "" });
  });
  it("unset secret shows Set and no Clear", () => {
    render(<Harness isSet={false} />);
    expect(screen.getByRole("button", { name: "Set" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});
