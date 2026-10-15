import { Link } from "react-router-dom";
import { rupees } from "./api";

export default function ProductCard({ p }: { p: any }) {
  const sale = !!p.salePricePaise;
  const off = sale ? Math.round((1 - p.salePricePaise / p.pricePaise) * 100) : 0;
  return (
    <Link to={`/p/${p.slug}`} className="product-card block">
      <div className="card-img">
        {p.image ? <img src={p.image} alt={p.name} loading="lazy" /> : <div className="ph">{p.name.charAt(0)}</div>}
        {!p.inStock ? <span className="badge badge-dark">Sold out</span> : sale && <span className="badge">{off}% off</span>}
      </div>
      <p className="mt-3 text-sm font-medium">{p.name}</p>
      <p className="text-sm text-stone-600">
        {sale ? <><b className="text-ink">{rupees(p.salePricePaise)}</b> <s className="ml-1 text-stone-400">{rupees(p.pricePaise)}</s></> : rupees(p.pricePaise)}
      </p>
    </Link>
  );
}
