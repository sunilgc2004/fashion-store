import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../db";
import { AppError, shippingFor } from "../services/orders";

export const shop = Router();
const PAGE = 12;

shop.get("/categories", async (_req, res) => {
  res.json(await prisma.category.findMany({ where: { active: true }, select: { name: true, slug: true }, orderBy: { name: "asc" } }));
});

const listQ = z.object({
  q: z.string().trim().max(80).optional(),
  category: z.string().max(80).optional(),
  minPrice: z.coerce.number().int().min(0).optional(), // paise
  maxPrice: z.coerce.number().int().min(0).optional(),
  size: z.string().max(20).optional(),
  colour: z.string().max(30).optional(),
  inStock: z.literal("1").optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).default("new"),
  page: z.coerce.number().int().min(1).default(1),
});

shop.get("/products", async (req, res) => {
  const f = listQ.parse(req.query);
  const v: Prisma.ProductVariantWhereInput = { ...(f.size ? { size: f.size } : {}), ...(f.colour ? { colour: f.colour } : {}), ...(f.inStock ? { stock: { gt: 0 } } : {}) };
  const where: Prisma.ProductWhereInput = {
    published: true,
    category: { active: true, ...(f.category ? { slug: f.category } : {}) },
    ...(f.q ? { OR: [{ name: { contains: f.q, mode: "insensitive" } }, { description: { contains: f.q, mode: "insensitive" } }] } : {}),
    ...(Object.keys(v).length ? { variants: { some: v } } : {}),
    ...(f.minPrice != null || f.maxPrice != null ? { pricePaise: { gte: f.minPrice, lte: f.maxPrice } } : {}), // list price; sale price not yet considered
  };
  const orderBy: Prisma.ProductOrderByWithRelationInput =
    f.sort === "price_asc" ? { pricePaise: "asc" } : f.sort === "price_desc" ? { pricePaise: "desc" } : { createdAt: "desc" };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where, orderBy, skip: (f.page - 1) * PAGE, take: PAGE,
      select: { id: true, name: true, slug: true, pricePaise: true, salePricePaise: true, images: { orderBy: { position: "asc" }, take: 1, select: { url: true } }, variants: { select: { stock: true } } },
    }),
  ]);
  res.json({ total, page: f.page, pageSize: PAGE, items: rows.map(({ variants, images, ...p }) => ({ ...p, image: images[0]?.url ?? null, inStock: variants.some((x) => x.stock > 0) })) });
});

shop.get("/products/:slug", async (req, res) => {
  const p = await prisma.product.findFirst({
    where: { slug: req.params.slug, published: true, category: { active: true } },
    select: { id: true, name: true, slug: true, description: true, pricePaise: true, salePricePaise: true, images: { orderBy: { position: "asc" }, select: { url: true } }, variants: { select: { id: true, size: true, colour: true, stock: true } } },
  });
  if (!p) throw new AppError("NOT_FOUND", "Product not found", 404);
  res.json({ ...p, variants: p.variants.map((x) => ({ ...x, stock: Math.min(x.stock, 10) })) }); // don't expose exact stock
});

/** Re-prices the client's cart from the DB so the UI never shows (or trusts) stale prices. */
shop.post("/cart/quote", async (req, res) => {
  const { lines } = z.object({ lines: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1).max(10) })).max(30) }).parse(req.body);
  const vs = await prisma.productVariant.findMany({ where: { id: { in: lines.map((l) => l.variantId) } }, include: { product: { include: { category: true } } } });
  const byId = new Map(vs.map((x) => [x.id, x]));
  let subtotal = 0;
  const out = lines.map((l) => {
    const x = byId.get(l.variantId);
    if (!x || !x.product.published || !x.product.category.active) return { ...l, ok: false, reason: "No longer available" };
    const unit = x.product.salePricePaise ?? x.product.pricePaise;
    const ok = x.stock >= l.qty;
    if (ok) subtotal += unit * l.qty;
    return { ...l, name: x.product.name, label: [x.size, x.colour].filter(Boolean).join(" / "), unitPricePaise: unit, ok, reason: ok ? undefined : x.stock > 0 ? `Only ${x.stock} left` : "Out of stock" };
  });
  const shipping = subtotal ? shippingFor(subtotal) : 0;
  res.json({ lines: out, subtotalPaise: subtotal, shippingPaise: shipping, totalPaise: subtotal + shipping });
});
