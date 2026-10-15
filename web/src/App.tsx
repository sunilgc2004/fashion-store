import { useEffect, useState } from "react";
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { api } from "./api";
import { CartProvider, useCart } from "./cart";
import Home from "./pages/Home";
import Catalogue from "./pages/Catalogue";
import Product from "./pages/Product";
import Cart from "./pages/Cart";
import Checkout from "./pages/Checkout";
import Login from "./pages/Login";
import AdminApp from "./admin/AdminApp";

type Me = { name: string } | null;

function Header({ me, onLogout }: { me: Me; onLogout: () => void }) {
  const { lines } = useCart();
  const count = lines.reduce((n, l) => n + l.qty, 0);
  return (
    <header className="sticky top-0 z-20 border-b border-stone-200 bg-ivory/90 backdrop-blur">
      <div className="bg-ink py-1.5 text-center text-xs tracking-wide text-white">Cash on delivery available · Secure online payments</div>
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-display text-3xl font-semibold tracking-wide">YOUR STORE</Link>
        <div className="flex items-center gap-6 text-sm">
          <NavLink to="/shop" className="hover:text-brand">Shop</NavLink>
          <Link to="/cart" className="hover:text-brand">Bag{count > 0 && <span className="ml-1 rounded-full bg-brand px-2 py-0.5 text-xs text-white">{count}</span>}</Link>
          {me ? <button onClick={onLogout} className="hover:text-brand">Logout ({me.name.split(" ")[0]})</button> : <Link to="/login" className="hover:text-brand">Login</Link>}
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  // TODO: replace the placeholder contact details and add your policy pages
  return (
    <footer className="mt-20 bg-ink text-stone-300">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 text-sm md:grid-cols-3">
        <div><p className="font-display text-2xl text-white">YOUR STORE</p><p className="mt-2">Dresses, clothing and accessories.</p></div>
        <div className="space-y-1"><p className="mb-2 font-medium text-white">Support</p><p>hello@yourstore.example</p><p>+91 00000 00000</p></div>
        <div className="space-y-1"><p className="mb-2 font-medium text-white">Shop</p><Link to="/shop" className="block hover:text-white">All products</Link><Link to="/cart" className="block hover:text-white">Your bag</Link></div>
      </div>
      <p className="border-t border-stone-700 py-4 text-center text-xs">© {new Date().getFullYear()} Your Store</p>
    </footer>
  );
}

function Shell({ me, loadMe, onLogout }: { me: Me; loadMe: () => void; onLogout: () => void }) {
  const admin = useLocation().pathname.startsWith("/admin"); // admin has its own header
  return (
    <>
      {!admin && <Header me={me} onLogout={onLogout} />}
      <main className={`mx-auto max-w-6xl ${admin ? "p-4" : "px-4 py-8"}`}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/shop" element={<Catalogue />} />
          <Route path="/p/:slug" element={<Product />} />
          <Route path="/cart" element={<Cart />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/login" element={<Login onAuth={loadMe} />} />
          <Route path="/admin/*" element={<AdminApp />} />
        </Routes>
      </main>
      {!admin && <Footer />}
    </>
  );
}

export default function App() {
  const [me, setMe] = useState<Me>(null);
  const loadMe = () => api("/auth/me").then(setMe).catch(() => setMe(null));
  useEffect(() => { loadMe(); }, []);
  return (
    <BrowserRouter>
      <CartProvider>
        <Shell me={me} loadMe={loadMe} onLogout={() => api("/auth/logout", { method: "POST", body: {} }).then(() => setMe(null))} />
      </CartProvider>
    </BrowserRouter>
  );
}
