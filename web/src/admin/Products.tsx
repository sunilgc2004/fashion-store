import { FormEvent, useEffect, useState } from "react";
import { api, rupees } from "../api";

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const paise = (v: FormDataEntryValue | null) => (v ? Math.round(Number(v) * 100) : null);

export default function Products() {
  const [data, setData] = useState<any>(null);
  const [cats, setCats] = useState<any[]>([]);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [msg, setMsg] = useState("");
  const load = () => api(`/admin/products?${new URLSearchParams({ page: String(page), ...(q && { q }) })}`).then(setData).catch((e) => setMsg(e.message));
  const loadCats = () => api("/admin/categories").then(setCats).catch(() => {});
  useEffect(() => { load(); }, [q, page]);
  useEffect(() => { loadCats(); }, []);
  const run = async (fn: () => Promise<unknown>) => { setMsg(""); try { await fn(); await load(); } catch (e: any) { setMsg(e.message); } };

  const adjust = (id: string) => {
    const n = Number(prompt("Add or remove units (e.g. 10 or -2):"));
    if (n) run(() => api(`/admin/variants/${id}/adjust`, { body: { delta: Math.trunc(n) } }));
  };
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const fd = new FormData(f);
    const variants = String(fd.get("variants")).split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      const [sku, size, colour, stock] = l.split(",").map((x) => x.trim());
      return { sku, ...(size && { size }), ...(colour && { colour }), stock: Number(stock) };
    });
    const name = String(fd.get("name"));
    await run(async () => {
      await api("/admin/products", { body: {
        name, slug: String(fd.get("slug")) || slugify(name), description: fd.get("description"), pricePaise: paise(fd.get("price")),
        salePricePaise: paise(fd.get("sale")), categoryId: fd.get("categoryId"), published: fd.get("published") === "on",
        images: String(fd.get("images")).split("\n").map((l) => l.trim()).filter(Boolean), variants,
      } });
      f.reset();
    });
  }
  async function addCategory(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = e.currentTarget;
    const name = String(new FormData(f).get("name"));
    try { await api("/admin/categories", { body: { name, slug: slugify(name) } }); f.reset(); loadCats(); } catch (x: any) { setMsg(x.message); }
  }
  const pages = data ? Math.ceil(data.total / data.pageSize) : 0;
  const input = "rounded border p-2";
  return (
    <div className="space-y-6">
      {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
      <div className="flex flex-wrap items-center gap-4">
        <input placeholder="Search products" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className={input} />
        <form onSubmit={addCategory} className="flex gap-2"><input name="name" placeholder="New category" required className={input} /><button className="rounded border px-3">Add</button></form>
        <span className="text-sm text-neutral-500">{cats.map((c) => `${c.name}${c.active ? "" : " (off)"}`).join(" · ")}</span>
      </div>
      <details className="rounded border p-3">
        <summary className="cursor-pointer font-medium">Add a product</summary>
        <form onSubmit={create} className="mt-3 grid gap-2 md:grid-cols-2">
          <input name="name" placeholder="Name" required className={input} />
          <input name="slug" placeholder="URL slug (auto if blank)" className={input} />
          <textarea name="description" placeholder="Description" required className={`${input} md:col-span-2`} />
          <input name="price" type="number" step="0.01" min="1" placeholder="Price (₹)" required className={input} />
          <input name="sale" type="number" step="0.01" min="1" placeholder="Sale price (₹, optional)" className={input} />
          <select name="categoryId" required className={input}><option value="">Category…</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
          <label className="p-2 text-sm"><input type="checkbox" name="published" /> Publish now</label>
          <textarea name="images" placeholder="Image URLs (https), one per line" className={`${input} md:col-span-2`} />
          <textarea name="variants" required placeholder={"Variants, one per line: SKU, size, colour, stock\nDRS-001-M-RED, M, Red, 10"} className={`${input} md:col-span-2`} />
          <button className="rounded bg-black p-2 text-white md:col-span-2">Create product</button>
        </form>
      </details>
      <table className="w-full text-left text-sm">
        <thead><tr><th>Product</th><th>Category</th><th>Price</th><th>Stock by variant</th><th>Published</th></tr></thead>
        <tbody>
          {data?.items.map((p: any) => (
            <tr key={p.id} className="border-t align-top">
              <td>{p.name}</td><td>{p.category.name}</td>
              <td>{p.salePricePaise ? `${rupees(p.salePricePaise)} (was ${rupees(p.pricePaise)})` : rupees(p.pricePaise)}</td>
              <td>{p.variants.map((v: any) => (
                <p key={v.id} className={v.stock <= v.lowStockAt ? "text-red-600" : ""}>{[v.size, v.colour].filter(Boolean).join(" / ") || v.sku}: {v.stock} <button className="underline" onClick={() => adjust(v.id)}>adjust</button></p>
              ))}</td>
              <td><input type="checkbox" aria-label={`Publish ${p.name}`} checked={p.published} onChange={(e) => run(() => api(`/admin/products/${p.id}`, { method: "PATCH", body: { published: e.target.checked } }))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {data && !data.items.length && <p>No products yet.</p>}
      {pages > 1 && <div className="flex gap-3 text-sm"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><span>Page {page} of {pages}</span><button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>}
    </div>
  );
}
