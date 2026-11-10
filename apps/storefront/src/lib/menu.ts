import type { Category, Locale, StoreConfig } from "../api/types";

export interface MenuLink { key: string; label: string; to?: string; href?: string; newTab?: boolean }
export interface MenuNode extends MenuLink { children: MenuLink[] }

const DEFAULT_COUNT = 4;

/**
 * Resolves the storefront top menu. `auto` (the default) = "all products" + the first four top-level categories.
 * Manual menus reference categories by id (items whose category was deleted or hidden are skipped) and custom links.
 */
export function buildMenu(menu: StoreConfig["menu"] | undefined, cats: Category[], locale: Locale, productsLabel: string): MenuNode[] {
  const top = cats.filter((c) => !c.parentId);
  const productsLink: MenuNode = { key: "products", label: productsLabel, to: "/products", children: [] };
  if (!menu || menu.auto) return [productsLink, ...top.slice(0, DEFAULT_COUNT).map((c): MenuNode => ({ key: c.id, label: c.name, to: `/category/${c.slug}`, children: [] }))];
  const nodes: MenuNode[] = menu.showProductsLink ? [productsLink] : [];
  for (const item of menu.items) {
    const label = (locale === "en" && item.labelEn.trim()) || item.label.trim();
    if (item.type === "category") {
      const cat = cats.find((c) => c.id === item.categoryId);
      if (!cat) continue;
      const children = item.showChildren ? cats.filter((c) => c.parentId === cat.id).map((c): MenuLink => ({ key: c.id, label: c.name, to: `/category/${c.slug}` })) : [];
      nodes.push({ key: item.id, label: label || cat.name, to: `/category/${cat.slug}`, children });
    } else if (item.url.startsWith("/")) nodes.push({ key: item.id, label, to: item.url, children: [], ...(item.newTab ? { newTab: true } : {}) });
    else nodes.push({ key: item.id, label, href: item.url, children: [], newTab: item.newTab });
  }
  return nodes;
}
