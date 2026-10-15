import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, rupees } from "../api";
import { useCart } from "../cart";

export default function Product() {
  const { slug } = useParams();
  const { add } = useCart();
  const nav = useNavigate();
  const [p, setP] = useState<any>(null);
  const [vid, setVid] = useState("");
  const [img, setImg] = useState(0);
  const [err, setErr] = useState("");
  useEffect(() => { api(`/products/${slug}`).then(setP).catch((e) => setErr(e.message)); }, [slug]);
  if (err) return <p role="alert" className="py-12 text-center">{err}</p>;
  if (!p) return <div className="grid gap-10 md:grid-cols-2"><div className="card-img animate-pulse" /><div className="h-64 animate-pulse rounded-xl bg-sand" /></div>;
  const label = (v: any) => [v.size, v.colour].filter(Boolean).join(" / ") || "Standard";
  const v = p.variants.find((x: any) => x.id === vid);
  const sale = !!p.salePricePaise;
  return (
    <div className="grid gap-10 md:grid-cols-2">
      <div className="space-y-3">
        <div className="card-img">{p.images[img] ? <img src={p.images[img].url} alt={p.name} /> : <div className="ph">{p.name.charAt(0)}</div>}</div>
        {p.images.length > 1 && (
          <div className="flex gap-2">
            {p.images.map((i: any, n: number) => (
              <button key={i.url} aria-label={`Show image ${n + 1}`} onClick={() => setImg(n)} className={`h-20 w-16 overflow-hidden rounded-lg border-2 ${n === img ? "border-brand" : "border-transparent"}`}>
                <img src={i.url} alt="" className="h-full w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="space-y-5 md:sticky md:top-32 md:self-start">
        <Link to="/shop" className="text-sm text-stone-500 hover:text-brand">← Back to shop</Link>
        <h1 className="text-4xl leading-tight">{p.name}</h1>
        <p className="text-2xl">{sale ? <><b>{rupees(p.salePricePaise)}</b> <s className="ml-2 text-lg text-stone-400">{rupees(p.pricePaise)}</s></> : rupees(p.pricePaise)}</p>
        <p className="whitespace-pre-line leading-relaxed text-stone-600">{p.description}</p>
        <div>
          <p className="mb-2 text-sm font-medium">Choose an option</p>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Choose an option">
            {p.variants.map((x: any) => (
              <button key={x.id} role="radio" aria-checked={vid === x.id} disabled={x.stock < 1} onClick={() => setVid(x.id)} className={`chip ${vid === x.id ? "chip-on" : ""} ${x.stock < 1 ? "chip-off" : ""}`}>{label(x)}</button>
            ))}
          </div>
          {v && v.stock > 0 && v.stock <= 3 && <p className="mt-2 text-sm text-brand">Only {v.stock} left</p>}
        </div>
        <button className="btn w-full" disabled={!vid} onClick={() => { add(vid); nav("/cart"); }}>{vid ? "Add to bag" : "Select an option"}</button>
        <p className="text-xs text-stone-500">Cash on delivery available · Secure online payment</p>
      </div>
    </div>
  );
}
