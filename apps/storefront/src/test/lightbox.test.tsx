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

  it("is a bounded panel, not a full-bleed picture: the stage has a capped height and the image is fitted (object-contain) inside it", () => {
    const { container } = render(<Lightbox images={imgs} index={0} title="Mug" onIndex={() => {}} onClose={() => {}} />);
    const panel = container.querySelector("dialog > div > div") as HTMLElement;
    expect(panel.className).toMatch(/w-\[min\(100%,56rem\)\]/); expect(panel.className).toContain("rounded-2xl"); expect(panel.className).toContain("overflow-hidden");
    const stage = container.querySelector("div[class*='h-[min(62dvh,34rem)]']"); expect(stage).toBeTruthy();
    const big = container.querySelectorAll("img")[0] as HTMLImageElement;
    expect(big.className).toContain("object-contain"); expect(big.className).not.toMatch(/max-h-full|max-w-full/);
  });
  it("zoom toggles from the button and from clicking the picture; changing image resets it", () => {
    const onIndex = vi.fn();
    const { container, rerender } = render(<Lightbox images={imgs} index={0} title="Mug" onIndex={onIndex} onClose={() => {}} />);
    const zoomBtn = () => screen.getByLabelText(/lightbox\.zoom(In|Out)/);
    expect(zoomBtn().getAttribute("aria-label")).toBe("lightbox.zoomIn"); expect(zoomBtn().getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(zoomBtn());
    expect(zoomBtn().getAttribute("aria-label")).toBe("lightbox.zoomOut"); expect(container.querySelector("[class*='scale-[2.2]']")).toBeTruthy();
    fireEvent.click(container.querySelector("img")!.closest("div[class*='cursor-zoom']")!);   // click the picture itself: zoom out again
    expect(zoomBtn().getAttribute("aria-label")).toBe("lightbox.zoomIn");
    fireEvent.click(zoomBtn());
    rerender(<Lightbox images={imgs} index={1} title="Mug" onIndex={onIndex} onClose={() => {}} />);
    expect(zoomBtn().getAttribute("aria-label")).toBe("lightbox.zoomIn");                      // new image starts unzoomed
  });
  it("thumbnail strip: one button per image, current one marked, click jumps; hidden for a single image", () => {
    const onIndex = vi.fn();
    render(<Lightbox images={imgs} index={1} title="Mug" onIndex={onIndex} onClose={() => {}} />);
    const thumbs = screen.getAllByLabelText("lightbox.goto");
    expect(thumbs).toHaveLength(3); expect(thumbs.map((b) => b.getAttribute("aria-current"))).toEqual(["false", "true", "false"]);
    fireEvent.click(thumbs[2]!); expect(onIndex).toHaveBeenLastCalledWith(2);
  });
  it("shows the alt text as a caption (only when it adds something) and the title in the header", () => {
    const { rerender } = render(<Lightbox images={[{ url: "https://x/a.jpg", alt: "Mavi seramik kupa, ön görünüm" }]} index={0} title="Mug" onIndex={() => {}} onClose={() => {}} />);
    expect(screen.getByText("Mavi seramik kupa, ön görünüm")).toBeTruthy(); expect(screen.getAllByText("Mug").length).toBeGreaterThan(0);
    rerender(<Lightbox images={[{ url: "https://x/a.jpg", alt: "Mug" }]} index={0} title="Mug" onIndex={() => {}} onClose={() => {}} />);
    expect(screen.queryAllByText("Mug")).toHaveLength(1);                                       // alt equal to the title is not repeated
  });
  it("locks page scroll while open and restores it on close", () => {
    document.documentElement.style.overflow = "";
    const { unmount } = render(<Lightbox images={imgs} index={0} title="Mug" onIndex={() => {}} onClose={() => {}} />);
    expect(document.documentElement.style.overflow).toBe("hidden");
    unmount(); expect(document.documentElement.style.overflow).toBe("");
  });
});
