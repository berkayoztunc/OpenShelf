import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { api } from "../api/client";
import type { Cart } from "../api/types";
import { useConfig } from "../store/ConfigContext";
import { computeTotals, type Totals } from "./totals";

const KEY = "os_cart_id";

interface CartCtx {
  cart: Cart | null;
  totals: Totals;
  currency: string;
  busy: boolean;
  error: string | null;
  drawerOpen: boolean;
  setDrawerOpen: (v: boolean) => void;
  setQuantity: (variantId: string, quantity: number) => Promise<void>;
  addItem: (variantId: string, quantity: number) => Promise<Cart | null>;
  applyCoupon: (code: string) => Promise<void>;
  forget: () => void;
  refresh: () => Promise<void>;
}
const Ctx = createContext<CartCtx | null>(null);
export const useCart = () => { const c = useContext(Ctx); if (!c) throw new Error("CartProvider missing"); return c; };

const readId = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const writeId = (id: string | null) => { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function CartProvider({ children }: { children: ReactNode }) {
  const { config } = useConfig();
  const [cart, setCart] = useState<Cart | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const idRef = useRef<string | null>(readId());
  // Serialise mutations so rapid +/- clicks cannot interleave.
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const run = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const p = chain.current.then(async () => {
      setBusy(true); setError(null);
      try { return await fn(); }
      catch (e) { setError(e instanceof Error ? e.message : "error"); throw e; }
      finally { setBusy(false); }
    });
    chain.current = p.catch(() => {});
    return p;
  }, []);

  const refresh = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    try { setCart(await api.getCart(id)); }
    catch { idRef.current = null; writeId(null); setCart(null); } // expired / unknown cart
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const ensureId = async () => {
    if (idRef.current) return idRef.current;
    const { id } = await api.createCart();
    idRef.current = id; writeId(id);
    return id;
  };

  const mutate = useCallback((fn: (id: string) => Promise<Cart | undefined>) =>
    run(async () => {
      const id = await ensureId();
      const res = await fn(id);
      const next = res && Array.isArray((res as Cart).items) ? res : await api.getCart(id);
      setCart(next);
      return next;
    }), [run]);

  const value = useMemo<CartCtx>(() => ({
    cart,
    totals: computeTotals(cart, config.checkout),
    currency: cart?.currency ?? config.general.currency,
    busy, error, drawerOpen, setDrawerOpen, refresh,
    setQuantity: async (variantId, quantity) => { await mutate((id) => api.setItem(id, variantId, quantity)).catch(() => {}); },
    addItem: async (variantId, quantity) => {
      const existing = cart?.items.find((i) => i.variantId === variantId)?.quantity ?? 0;
      try { return await mutate((id) => api.setItem(id, variantId, existing + quantity)); } catch { return null; }
    },
    applyCoupon: async (code) => { await mutate((id) => api.applyCoupon(id, code)); },
    forget: () => { idRef.current = null; writeId(null); setCart(null); },
  }), [cart, config.checkout, config.general.currency, busy, error, drawerOpen, mutate, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
