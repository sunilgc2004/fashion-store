import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, rupees } from "../api";
import { useCart } from "../cart";

export default function Cart() {
  const { lines, setQty } = useCart();
  const [q, setQ] = useState<any>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    if (!lines.length) { setQ(null); return; }
    api("/cart/quote", { body: { lines } }).then((r) => { setQ(r); setErr(""); }).catch((e) => setErr(e.message));
  }, [lines]);
  if (!lines.length) return <p>Your cart is empty. <Link to="/shop" className="underline">Keep shopping</Link></p>;
  if (err) return <p role="alert" className="text-red-600">{err}</p>;
  if (!q) return <p>Loading…</p>;
  const blocked = q.lines.some((l: any) => !l.ok);
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Your cart</h1>
      {q.lines.map((l: any) => (
        <div key={l.variantId} className="flex items-center justify-between border-b pb-3">
          <div>
            <p>{l.name ?? "Unavailable item"} {l.label && <span className="text-sm text-neutral-500">({l.label})</span>}</p>
            {!l.ok && <p role="alert" className="text-sm text-red-600">{l.reason}</p>}
          </div>
          <div className="flex items-center gap-3">
            <button aria-label="Decrease" onClick={() => setQty(l.variantId, l.qty - 1)}>−</button>
            <span>{l.qty}</span>
            <button aria-label="Increase" onClick={() => setQty(l.variantId, l.qty + 1)}>+</button>
            <span className="w-24 text-right">{l.unitPricePaise ? rupees(l.unitPricePaise * l.qty) : "—"}</span>
            <button aria-label="Remove" onClick={() => setQty(l.variantId, 0)}>✕</button>
          </div>
        </div>
      ))}
      <div className="space-y-1 text-right text-sm">
        <p>Subtotal {rupees(q.subtotalPaise)}</p>
        <p>Shipping {q.shippingPaise ? rupees(q.shippingPaise) : "Free"}</p>
        <p className="text-lg font-semibold">Total {rupees(q.totalPaise)}</p>
      </div>
      {blocked ? <p className="text-right text-sm text-red-600">Adjust or remove unavailable items to continue.</p>
        : <Link to="/checkout" className="btn w-full">Checkout</Link>}
    </div>
  );
}
