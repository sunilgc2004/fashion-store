import { FormEvent, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCart } from "../cart";

declare global { interface Window { Razorpay: any } }
const loadRazorpay = () => new Promise<void>((ok, fail) => {
  if (window.Razorpay) return ok();
  const s = document.createElement("script");
  s.src = "https://checkout.razorpay.com/v1/checkout.js";
  s.onload = () => ok();
  s.onerror = () => fail(new Error("Could not load the payment window"));
  document.body.appendChild(s);
});

export default function Checkout() {
  const { lines, clear } = useCart();
  const nav = useNavigate();
  const [addrs, setAddrs] = useState<any[] | null>(null);
  const [addrId, setAddrId] = useState("");
  const [method, setMethod] = useState<"ONLINE" | "COD">("ONLINE");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [done, setDone] = useState("");
  const key = useRef(crypto.randomUUID()); // same key on retry = same order, never a duplicate

  useEffect(() => {
    api("/addresses").then((a) => { setAddrs(a); setAddrId(a[0]?.id ?? ""); })
      .catch((e) => (e.status === 401 ? nav("/login?next=/checkout") : setMsg(e.message)));
  }, []);

  async function addAddress(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      const a = await api("/addresses", { body: Object.fromEntries(new FormData(f)) });
      setAddrs((x) => [a, ...(x ?? [])]); setAddrId(a.id); setMsg(""); f.reset();
    } catch (x: any) { setMsg(x.message); }
  }

  async function pay() {
    setBusy(true); setMsg("");
    try {
      const order = await api("/orders", { body: { addressId: addrId, method, idempotencyKey: key.current, lines } });
      if (method === "COD") { clear(); setDone(`Order ${order.orderNumber} placed. Pay cash on delivery.`); return; }
      if (order.status !== "PENDING_PAYMENT") throw new Error("That order has expired. Please try again.");
      const g = await api("/payments/create", { body: { orderId: order.id } });
      await loadRazorpay();
      new window.Razorpay({
        key: g.keyId, amount: g.amount, currency: g.currency, order_id: g.gatewayOrderId, name: "Your Store",
        handler: async (r: any) => {
          const v = await api("/payments/verify", { body: r }).catch(() => ({ status: "pending" }));
          clear();
          setDone(v.status === "paid" ? `Order ${order.orderNumber} confirmed. Thank you!` : `Order ${order.orderNumber}: payment received, confirmation pending. We'll update you shortly.`);
        },
        modal: { ondismiss: () => { setBusy(false); setMsg("Payment not completed. You can retry here."); } },
      }).open();
    } catch (e: any) { key.current = crypto.randomUUID(); setMsg(e.message); setBusy(false); }
  }

  if (done) return <p role="status" className="text-lg">{done} <Link to="/shop" className="underline">Continue shopping</Link></p>;
  if (!lines.length) return <p>Your cart is empty. <Link to="/shop" className="underline">Keep shopping</Link></p>;
  if (!addrs) return <p>{msg || "Loading…"}</p>;
  const input = "rounded border p-2";
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Checkout</h1>
      <section className="space-y-2">
        <h2 className="font-medium">Delivery address</h2>
        {addrs.map((a) => (
          <label key={a.id} className="block rounded border p-3 text-sm">
            <input type="radio" name="addr" checked={addrId === a.id} onChange={() => setAddrId(a.id)} /> {a.name}, {a.line1}{a.line2 ? `, ${a.line2}` : ""}, {a.city}, {a.state} {a.pincode} · {a.phone}
          </label>
        ))}
        <details open={!addrs.length}>
          <summary className="cursor-pointer text-sm underline">Add a new address</summary>
          <form onSubmit={addAddress} className="mt-2 grid grid-cols-2 gap-2">
            <input name="name" placeholder="Full name" required className={input} />
            <input name="phone" placeholder="Mobile" required className={input} />
            <input name="line1" placeholder="Address line 1" required className={`${input} col-span-2`} />
            <input name="line2" placeholder="Address line 2" className={`${input} col-span-2`} />
            <input name="city" placeholder="City" required className={input} />
            <input name="state" placeholder="State" required className={input} />
            <input name="pincode" placeholder="Pincode" required className={input} />
            <button className="rounded border p-2">Save address</button>
          </form>
        </details>
      </section>
      <section className="space-y-2">
        <h2 className="font-medium">Payment</h2>
        <label className="block"><input type="radio" checked={method === "ONLINE"} onChange={() => setMethod("ONLINE")} /> Pay online (card, UPI, netbanking)</label>
        <label className="block"><input type="radio" checked={method === "COD"} onChange={() => setMethod("COD")} /> Cash on delivery</label>
      </section>
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
      <button disabled={!addrId || busy} onClick={pay} className="w-full btn">{busy ? "Please wait…" : "Place order"}</button>
    </div>
  );
}
