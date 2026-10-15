import { FormEvent, useEffect, useState } from "react";
import { Link, Route, Routes } from "react-router-dom";
import { api, rupees } from "../api";
import Orders from "./Orders";
import Products from "./Products";

function AdminLogin({ onDone }: { onDone: () => void }) {
  const [err, setErr] = useState("");
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    try { await api("/admin/login", { body: Object.fromEntries(new FormData(e.currentTarget)) }); onDone(); } catch (x: any) { setErr(x.message); }
  }
  return (
    <form onSubmit={submit} className="mx-auto max-w-sm space-y-3 pt-16">
      <h1 className="text-2xl font-semibold">Admin sign in</h1>
      <input name="email" type="email" placeholder="Email" required className="w-full rounded border p-2" />
      <input name="password" type="password" placeholder="Password" required className="w-full rounded border p-2" />
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      <button className="btn w-full">Sign in</button>
    </form>
  );
}

function Dashboard() {
  const [d, setD] = useState<any>(null);
  useEffect(() => { api("/admin/dashboard").then(setD).catch(() => {}); }, []);
  if (!d) return <p>Loading…</p>;
  const s = d.byStatus;
  const cards: [string, string | number][] = [
    ["Products", d.products], ["Customers", d.customers], ["Orders", d.orders],
    ["Awaiting confirmation", s.PLACED ?? 0], ["In progress", (s.CONFIRMED ?? 0) + (s.PROCESSING ?? 0) + (s.SHIPPED ?? 0)],
    ["Delivered", s.DELIVERED ?? 0], ["Cancelled", s.CANCELLED ?? 0], ["Money received", rupees(d.collectedPaise)],
    ["COD yet to collect", `${rupees(d.pendingCodPaise)} (${d.pendingCodCount})`],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        {cards.map(([k, v]) => <div key={k} className="rounded border p-3"><p className="text-xs text-neutral-500">{k}</p><p className="text-xl font-semibold">{v}</p></div>)}
      </div>
      <section><h2 className="mb-2 font-medium">Recent orders</h2>
        {d.recent.map((o: any) => <p key={o.id} className="text-sm">{o.orderNumber} · {o.status} · {rupees(o.totalPaise)}</p>)}</section>
      <section><h2 className="mb-2 font-medium">Low stock</h2>
        {d.lowStock.length ? d.lowStock.map((v: any) => <p key={v.id} className="text-sm">{v.name} ({v.sku}): {v.stock} left</p>) : <p className="text-sm">Nothing low.</p>}</section>
    </div>
  );
}

export default function AdminApp() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [unread, setUnread] = useState(0);
  useEffect(() => { api("/admin/me").then(() => setOk(true)).catch(() => setOk(false)); }, []);
  useEffect(() => {
    if (!ok) return;
    const poll = () => api("/admin/notifications").then((r) => setUnread(r.unread)).catch(() => {});
    poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, [ok]);
  if (ok === null) return <p>Loading…</p>;
  if (!ok) return <AdminLogin onDone={() => setOk(true)} />;
  return (
    <div className="space-y-4">
      <nav className="flex items-center gap-5 border-b pb-3 text-sm">
        <b>Admin</b>
        <Link to="/admin">Dashboard</Link>
        <Link to="/admin/orders">Orders{unread > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs text-white">{unread} new</span>}</Link>
        <Link to="/admin/products">Products</Link>
        <button className="ml-auto" onClick={() => api("/auth/logout", { method: "POST", body: {} }).then(() => setOk(false))}>Log out</button>
      </nav>
      <Routes>
        <Route index element={<Dashboard />} />
        <Route path="orders" element={<Orders />} />
        <Route path="products" element={<Products />} />
      </Routes>
    </div>
  );
}
