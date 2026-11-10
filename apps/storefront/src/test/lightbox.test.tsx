import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("../i18n", () => ({ useI18n: () => ({ t: (k: string) => k }) }));
import { Lightbox } from "../components/Lightbox";

const imgs = [{ url: "https://x/a.jpg" }, { url: "https://x/b.jpg" }, { url: "https://x/c.jpg" }];

describe("Lightbox", () => {
  it("shows the counter and wraps around with next/prev", () => {
    const onIndex = vi.fn();
    render(<Lightbox images={imgs} index={2} title="Mug" onIndex={onIndex} onClose={() => {}} />);
    expect(screen.getByText("3 / 3")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("lightbox.next"));
    expect(onIndex).toHaveBeenLastCalledWith(0);
    fireEvent.click(screen.getByLabelText("lightbox.prev"));
    expect(onIndex).toHaveBeenLastCalledWith(1);
  });
  it("arrow keys navigate and the close button closes", () => {
    const onIndex = vi.fn(); const onClose = vi.fn();
    render(<Lightbox images={imgs} index={0} title="Mug" onIndex={onIndex} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("dialog", { hidden: true }), { key: "ArrowLeft" });
    expect(onIndex).toHaveBeenLastCalledWith(2);
    fireEvent.click(screen.getByLabelText("lightbox.close"));
    expect(onClose).toHaveBeenCalled();
  });
  it("hides navigation for a single image", () => {
    render(<Lightbox images={[imgs[0]!]} index={0} title="Mug" onIndex={() => {}} onClose={() => {}} />);
    expect(screen.queryByLabelText("lightbox.next")).toBeNull();
  });
});
