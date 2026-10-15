import { useEffect, useState } from "react";
import { api, rupees } from "../api";

// mirrors the server's rules for button visibility only; the server is what actually enforces them
const NEXT: Record<string, string[]> = { PLACED: ["CONFIRMED", "CANCELLED"], CONFIRMED: ["PROCESSING", "CANCELLED"], PROCESSING: ["SHIPPED", "CANCELLED"], SHIPPED: ["DELIVERED"] };
const STATUSES = ["PENDING_PAYMENT", "PLACED", "CONFIRMED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export default function Orders() {
  const [data, setData] = useState<any>(null);
  const [sel, setSel] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [err, setErr] = useState("");
  const load = () => api(`/admin/orders?${new URLSearchParams({ page: String(page), ...(status && { status }), ...(method && { method }), ...(q && { q }) })}`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [status, method, q, page]);
  const open = (id: string) => api(`/admin/orders/${id}`).then(setSel).catch((e) => setErr(e.message));
  const act = async (path: string, body: unknown) => {
    setErr("");
    try { await api(`/admin/orders/${sel.id}/${path}`, { body }); await open(sel.id); load(); } catch (e: any) { setErr(e.message); }
  };
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input placeholder="Search order no., name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="rounded border p-2" />
        <select aria-label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="rounded border p-2"><option value="">All statuses</option>{STATUSES.map((s) => <option key={s}>{s}</option>)}</select>
        <select aria-label="Payment method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(1); }} className="rounded border p-2"><option value="">Any payment</option><option>ONLINE</option><option>COD</option></select>
      </div>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <table className="w-full text-left text-sm">
        <thead><tr><th>Order</th><th>Customer</th><th>Date</th><th>Total</th><th>Payment</th><th>Status</th><th /></tr></thead>
        <tbody>
          {data?.items.map((o: any) => (
            <tr key={o.id} className="border-t">
              <td>{o.orderNumber}</td><td>{o.user.name}</td><td>{new Date(o.createdAt).toLocaleString("en-IN")}</td><td>{rupees(o.totalPaise)}</td>
              <td>{o.payment?.method} · {o.payment?.status}</td><td>{o.status}</td><td><button className="underline" onClick={() => open(o.id)}>View</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && !data.items.length && <p>No orders found.</p>}
      {pages > 1 && <div className="flex gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
      {sel && (
        <section className="space-y-3 rounded border p-4 text-sm">
          <h2 className="text-lg font-semibold">{sel.orderNumber} · {sel.status}</h2>
          <p>{sel.user.name} · {sel.user.email} · {sel.user.phone ?? "no phone"}</p>
          <p>Deliver to: {sel.shipTo.name}, {sel.shipTo.line1}{sel.shipTo.line2 ? `, ${sel.shipTo.line2}` : ""}, {sel.shipTo.city}, {sel.shipTo.state} {sel.shipTo.pincode} · {sel.shipTo.phone}</p>
          {sel.items.map((i: any) => <p key={i.id}>{i.qty} × {i.productName} {i.variantLabel && `(${i.variantLabel})`} @ {rupees(i.unitPricePaise)}</p>)}
          <p>Subtotal {rupees(sel.subtotalPaise)} · Shipping {rupees(sel.shippingPaise)} · <b>Total {rupees(sel.totalPaise)}</b></p>
          <p>Payment: {sel.payment.method} · {sel.payment.status}{sel.payment.gatewayPaymentId && ` · ref ${sel.payment.gatewayPaymentId}`}</p>
          <div className="flex flex-wrap gap-2">
            {(NEXT[sel.status] ?? []).map((to) => <button key={to} onClick={() => (to !== "CANCELLED" || confirm("Cancel this order and restore stock?")) && act("status", { to })} className="rounded border px-3 py-1">{to === "CANCELLED" ? "Cancel order" : `Mark ${to.toLowerCase()}`}</button>)}
            {sel.payment.method === "COD" && sel.payment.status === "PENDING" && sel.status === "DELIVERED" && <button onClick={() => act("collect", {})} className="rounded bg-black px-3 py-1 text-white">Record cash collected</button>}
          </div>
          <div><b>History</b>{sel.history.map((h: any) => <p key={h.id}>{new Date(h.createdAt).toLocaleString("en-IN")} → {h.toStatus}{h.note && ` (${h.note})`}</p>)}</div>
        </section>
      )}
    </div>
  );
}
