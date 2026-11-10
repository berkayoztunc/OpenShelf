export { foldTr, slugify } from "@openshelf/shared";
/** "orders#iade" -> { section: "orders", anchor: "iade" } */
export function parseGuide(ref: string): { section: string; anchor?: string } {
  const [section = "", anchor] = ref.replace(/^\/?help\/?/, "").split("#");
  return { section, anchor: anchor || undefined };
}
export const guidePath = (ref: string) => { const { section, anchor } = parseGuide(ref); return `/help${section ? `/${section}` : ""}${anchor ? `#${anchor}` : ""}`; };
