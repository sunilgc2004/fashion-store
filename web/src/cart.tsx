import { createContext, ReactNode, useContext, useEffect, useState } from "react";

type Line = { variantId: string; qty: number };
const Ctx = createContext<{ lines: Line[]; add: (id: string) => void; setQty: (id: string, qty: number) => void; clear: () => void }>(null!);
export const useCart = () => useContext(Ctx);

// Cart holds only variant ids + quantities. Prices always come from /cart/quote and the server at checkout.
export function CartProvider({ children }: { children: ReactNode }) {
  const [lines, setLines] = useState<Line[]>(() => { try { return JSON.parse(localStorage.getItem("cart") ?? "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem("cart", JSON.stringify(lines)); } catch { /* storage unavailable */ } }, [lines]);
  const setQty = (id: string, qty: number) => setLines((l) => (qty <= 0 ? l.filter((x) => x.variantId !== id) : l.map((x) => (x.variantId === id ? { ...x, qty: Math.min(qty, 10) } : x))));
  const add = (id: string) => setLines((l) => (l.some((x) => x.variantId === id) ? l.map((x) => (x.variantId === id ? { ...x, qty: Math.min(x.qty + 1, 10) } : x)) : [...l, { variantId: id, qty: 1 }]));
  return <Ctx.Provider value={{ lines, add, setQty, clear: () => setLines([]) }}>{children}</Ctx.Provider>;
}
