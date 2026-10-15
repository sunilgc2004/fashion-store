import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import ProductCard from "../ProductCard";

export default function Home() {
  const [cats, setCats] = useState<any[]>([]);
  const [fresh, setFresh] = useState<any[]>([]);
  useEffect(() => {
    api("/categories").then(setCats).catch(() => {});
    api("/products?sort=new").then((r) => setFresh(r.items.slice(0, 4))).catch(() => {});
  }, []);
  return (
    <div className="space-y-16">
      <section className="hero text-center">
        <div className="mx-auto max-w-2xl">
          <p className="eyebrow">New season</p>
          <h1 className="mt-3 text-5xl leading-none md:text-7xl">Dressed for every occasion</h1>
          <p className="mt-5 text-stone-600">Dresses, clothing and accessories, chosen with care.</p>
          <Link to="/shop" className="btn mt-8">Shop the collection</Link>
        </div>
      </section>
      {cats.length > 0 && (
        <section>
          <h2 className="mb-5 text-3xl">Shop by category</h2>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {cats.map((c) => <Link key={c.slug} to={`/shop?category=${c.slug}`} className="cat-tile">{c.name}</Link>)}
          </div>
        </section>
      )}
      {fresh.length > 0 && (
        <section>
          <div className="mb-5 flex items-end justify-between"><h2 className="text-3xl">New arrivals</h2><Link to="/shop" className="text-sm underline">View all</Link></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-4">{fresh.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </section>
      )}
    </div>
  );
}
