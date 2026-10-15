import { FormEvent, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../api";
import ProductCard from "../ProductCard";

export default function Catalogue() {
  const [sp, setSp] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(sp);
    v ? n.set(k, v) : n.delete(k);
    if (k !== "page") n.delete("page");
    setSp(n);
  };
  useEffect(() => { api("/categories").then(setCats).catch(() => {}); }, []);
  useEffect(() => { setData(null); setErr(""); api(`/products?${sp}`).then(setData).catch((e) => setErr(e.message)); }, [sp]);
  const page = Number(sp.get("page") ?? 1);
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const cat = sp.get("category") ?? "";
  const search = (e: FormEvent<HTMLFormElement>) => { e.preventDefault(); set("q", String(new FormData(e.currentTarget).get("q") ?? "")); };
  const chip = (on: boolean) => `chip ${on ? "chip-on" : ""}`;
  return (
    <div className="space-y-6">
      <div><p className="eyebrow">Collection</p><h1 className="text-4xl">{cats.find((c) => c.slug === cat)?.name ?? "All products"}</h1></div>
      <div className="flex flex-wrap gap-2">
        <button className={chip(!cat)} onClick={() => set("category", "")}>All</button>
        {cats.map((c) => <button key={c.slug} className={chip(cat === c.slug)} onClick={() => set("category", c.slug)}>{c.name}</button>)}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={search}><input name="q" defaultValue={sp.get("q") ?? ""} placeholder="Search products" aria-label="Search" className="w-56" /></form>
        <select aria-label="Sort" value={sp.get("sort") ?? "new"} onChange={(e) => set("sort", e.target.value)}>
          <option value="new">Newest</option><option value="price_asc">Price: low to high</option><option value="price_desc">Price: high to low</option>
        </select>
        <label className="text-sm"><input type="checkbox" checked={sp.get("inStock") === "1"} onChange={(e) => set("inStock", e.target.checked ? "1" : "")} /> In stock only</label>
        {data && <span className="ml-auto text-sm text-stone-500">{data.total} items</span>}
      </div>
      {err && <p role="alert" className="text-red-600">{err}</p>}
      {data && !data.items.length && <p className="py-12 text-center text-stone-500">No products match your search.</p>}
      <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">
        {!data && !err && Array.from({ length: 8 }).map((_, i) => <div key={i} className="card-img animate-pulse" />)}
        {data?.items.map((p: any) => <ProductCard key={p.id} p={p} />)}
      </div>
      {pages > 1 && (
        <div className="flex items-center justify-center gap-4 pt-4">
          <button className="btn-outline" disabled={page <= 1} onClick={() => set("page", String(page - 1))}>Previous</button>
          <span className="text-sm">Page {page} of {pages}</span>
          <button className="btn-outline" disabled={page >= pages} onClick={() => set("page", String(page + 1))}>Next</button>
        </div>
      )}
    </div>
  );
}
