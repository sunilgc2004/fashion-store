import { Response, Router } from "express";
import argon2 from "argon2";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../db";
import { issue, requireUser } from "./auth";
import { AppError, adminSetStatus } from "../services/orders";
import { recordCodCollection } from "../services/payments";

export const admin = Router();

admin.post("/login", rateLimit({ windowMs: 15 * 60_000, limit: 10 }), async (req, res) => {
  const b = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().max(100) }).parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || u.role !== "ADMIN" || !(await argon2.verify(u.passwordHash, b.password))) throw new AppError("BAD_LOGIN", "Invalid email or password", 401);
  issue(res, u.id, 8); // shorter session than customers
  res.json({ name: u.name });
});

// Everything below requires a logged-in user whose role in the DATABASE is ADMIN.
admin.use(requireUser, async (_req, res, next) => {
  const u = await prisma.user.findUnique({ where: { id: res.locals.userId }, select: { role: true } });
  if (u?.role !== "ADMIN") throw new AppError("FORBIDDEN", "Not allowed", 403);
  next();
});

const audit = (res: Response, action: string, entity: string, entityId: string, meta?: Prisma.InputJsonValue) =>
  prisma.auditLog.create({ data: { actorId: res.locals.userId, action, entity, entityId, meta } });
const page = z.coerce.number().int().min(1).default(1);
const money = z.number().int().min(100).max(10_000_000); // paise

admin.get("/me", (_req, res) => res.json({ ok: true }));

admin.get("/dashboard", async (_req, res) => {
  const [products, customers, byStatus, paid, cod, recent, unread, low] = await Promise.all([
    prisma.product.count(),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
    prisma.order.groupBy({ by: ["status"], _count: true }),
    prisma.payment.aggregate({ where: { status: "PAID" }, _sum: { amountPaise: true } }),
    prisma.payment.aggregate({ where: { method: "COD", status: "PENDING", order: { status: { not: "CANCELLED" } } }, _sum: { amountPaise: true }, _count: true }),
    prisma.order.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, orderNumber: true, status: true, totalPaise: true, createdAt: true } }),
    prisma.notification.count({ where: { readAt: null } }),
    prisma.$queryRaw<{ id: string; name: string; sku: string; stock: number }[]>`SELECT v."id", p."name", v."sku", v."stock" FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId" WHERE v."stock" <= v."lowStockAt" ORDER BY v."stock" ASC LIMIT 10`,
  ]);
  res.json({
    products, customers, unread, recent, lowStock: low,
    orders: byStatus.reduce((n, g) => n + g._count, 0),
    byStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])),
    collectedPaise: paid._sum.amountPaise ?? 0, // money actually received (online paid + COD collected)
    pendingCodPaise: cod._sum.amountPaise ?? 0, pendingCodCount: cod._count,
  });
});

admin.get("/notifications", async (_req, res) => {
  const [unread, items] = await Promise.all([prisma.notification.count({ where: { readAt: null } }), prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 20 })]);
  res.json({ unread, items });
});

// ---------- orders ----------
admin.get("/orders", async (req, res) => {
  const f = z.object({ status: z.nativeEnum(OrderStatus).optional(), method: z.enum(["ONLINE", "COD"]).optional(), q: z.string().trim().max(80).optional(), page }).parse(req.query);
  const like = (v: string) => ({ contains: v, mode: "insensitive" as const });
  const where: Prisma.OrderWhereInput = {
    ...(f.status ? { status: f.status } : {}),
    ...(f.method ? { payment: { method: f.method } } : {}),
    ...(f.q ? { OR: [{ orderNumber: like(f.q) }, { user: { OR: [{ email: like(f.q) }, { name: like(f.q) }] } }] } : {}),
  };
  const [total, items] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 20, take: 20,
      select: { id: true, orderNumber: true, status: true, totalPaise: true, createdAt: true, user: { select: { name: true, email: true } }, payment: { select: { method: true, status: true } } } }),
  ]);
  res.json({ total, page: f.page, pageSize: 20, items });
});

admin.get("/orders/:id", async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, include: { items: true, payment: true, history: { orderBy: { createdAt: "asc" } }, user: { select: { name: true, email: true, phone: true } } } });
  if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
  await prisma.notification.updateMany({ where: { orderId: o.id, readAt: null }, data: { readAt: new Date() } });
  res.json(o);
});

admin.post("/orders/:id/status", async (req, res) => {
  const { to } = z.object({ to: z.nativeEnum(OrderStatus) }).parse(req.body);
  await adminSetStatus(req.params.id, to, res.locals.userId); // enforces transitions + audit
  res.json({ ok: true });
});
admin.post("/orders/:id/collect", async (req, res) => {
  await recordCodCollection(req.params.id, res.locals.userId);
  res.json({ ok: true });
});

// ---------- categories ----------
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes").max(120);
admin.get("/categories", async (_req, res) => res.json(await prisma.category.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { products: true } } } })));
admin.post("/categories", async (req, res) => {
  const c = await prisma.category.create({ data: z.object({ name: z.string().trim().min(2).max(60), slug }).parse(req.body) });
  await audit(res, "CATEGORY_CREATE", "Category", c.id);
  res.status(201).json(c);
});
admin.patch("/categories/:id", async (req, res) => {
  const b = z.object({ name: z.string().trim().min(2).max(60).optional(), active: z.boolean().optional() }).parse(req.body);
  await prisma.category.update({ where: { id: req.params.id }, data: b }); // deactivating hides its products from the shop
  await audit(res, "CATEGORY_UPDATE", "Category", req.params.id, b);
  res.json({ ok: true });
});

// ---------- products & inventory ----------
const variantIn = z.object({ sku: z.string().trim().min(1).max(40), size: z.string().trim().max(20).optional(), colour: z.string().trim().max(30).optional(), stock: z.number().int().min(0).max(100000), lowStockAt: z.number().int().min(0).max(1000).default(3) });
const base = z.object({
  name: z.string().trim().min(2).max(120), slug, description: z.string().trim().min(1).max(5000),
  pricePaise: money, salePricePaise: money.nullable().optional(), categoryId: z.string(), published: z.boolean().default(false),
  images: z.array(z.string().url().startsWith("https://")).max(8).default([]), variants: z.array(variantIn).min(1).max(60),
});
const assertCategory = async (id: string) => { if (!(await prisma.category.findUnique({ where: { id } }))) throw new AppError("BAD_CATEGORY", "Category does not exist"); };

admin.get("/products", async (req, res) => {
  const f = z.object({ q: z.string().trim().max(80).optional(), page }).parse(req.query);
  const where: Prisma.ProductWhereInput = f.q ? { name: { contains: f.q, mode: "insensitive" } } : {};
  const [total, items] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({ where, orderBy: { createdAt: "desc" }, skip: (f.page - 1) * 20, take: 20,
      include: { category: { select: { name: true } }, variants: { select: { id: true, sku: true, size: true, colour: true, stock: true, lowStockAt: true } } } }),
  ]);
  res.json({ total, page: f.page, pageSize: 20, items });
});

admin.post("/products", async (req, res) => {
  const { images, variants, ...rest } = base.refine((p) => p.salePricePaise == null || p.salePricePaise < p.pricePaise, "Sale price must be below the price").parse(req.body);
  await assertCategory(rest.categoryId);
  const p = await prisma.product.create({ data: { ...rest, images: { create: images.map((url, position) => ({ url, position })) }, variants: { create: variants } } });
  await audit(res, "PRODUCT_CREATE", "Product", p.id);
  res.status(201).json(p);
});

admin.patch("/products/:id", async (req, res) => {
  const { images, ...b } = base.omit({ variants: true }).partial().parse(req.body);
  const cur = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!cur) throw new AppError("NOT_FOUND", "Product not found", 404);
  const price = b.pricePaise ?? cur.pricePaise;
  const sale = b.salePricePaise === undefined ? cur.salePricePaise : b.salePricePaise;
  if (sale != null && sale >= price) throw new AppError("BAD_PRICE", "Sale price must be below the price");
  if (b.categoryId) await assertCategory(b.categoryId);
  await prisma.$transaction(async (tx) => {
    if (images) {
      await tx.productImage.deleteMany({ where: { productId: cur.id } });
      await tx.productImage.createMany({ data: images.map((url, position) => ({ productId: cur.id, url, position })) });
    }
    await tx.product.update({ where: { id: cur.id }, data: b });
  });
  await audit(res, "PRODUCT_UPDATE", "Product", cur.id, { ...b, images: images ? "replaced" : undefined } as Prisma.InputJsonValue);
  res.json({ ok: true });
});

admin.post("/products/:id/variants", async (req, res) => {
  const v = await prisma.productVariant.create({ data: { ...variantIn.parse(req.body), productId: req.params.id } });
  await audit(res, "VARIANT_CREATE", "ProductVariant", v.id);
  res.status(201).json(v);
});

/** Relative stock change (+/-), so it can't overwrite units sold a moment ago, and can't go below zero. */
admin.post("/variants/:id/adjust", async (req, res) => {
  const { delta, note } = z.object({ delta: z.number().int().min(-100000).max(100000).refine((n) => n !== 0, "Enter a non-zero change"), note: z.string().max(200).optional() }).parse(req.body);
  const r = await prisma.productVariant.updateMany({ where: { id: req.params.id, stock: { gte: delta < 0 ? -delta : 0 } }, data: { stock: { increment: delta } } });
  if (r.count !== 1) throw new AppError("BAD_ADJUST", "Variant not found or stock would go below zero", 409);
  await audit(res, "STOCK_ADJUST", "ProductVariant", req.params.id, { delta, note: note ?? null });
  res.json({ ok: true });
});
