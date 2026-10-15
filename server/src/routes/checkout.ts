import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireUser } from "./auth";
import { AppError, placeOrder, cancelOrder } from "../services/orders";
import { confirmPayment, createGatewayOrder, markPaymentFailed, verifyCheckoutSignature, verifyWebhookSignature } from "../services/payments";

export const checkout = Router();

const addrBody = z.object({
  name: z.string().trim().min(1).max(80),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number"),
  line1: z.string().trim().min(3).max(120),
  line2: z.string().trim().max(120).optional().transform((x) => x || undefined),
  city: z.string().trim().min(1).max(60),
  state: z.string().trim().min(1).max(60),
  pincode: z.string().regex(/^\d{6}$/, "Enter a 6-digit pincode"),
});

checkout.get("/addresses", requireUser, async (_req, res) => {
  res.json(await prisma.address.findMany({ where: { userId: res.locals.userId }, orderBy: { id: "desc" } }));
});
checkout.post("/addresses", requireUser, async (req, res) => {
  res.status(201).json(await prisma.address.create({ data: { ...addrBody.parse(req.body), userId: res.locals.userId } }));
});

const placeBody = z.object({
  addressId: z.string(),
  method: z.enum(["ONLINE", "COD"]),
  idempotencyKey: z.string().min(8).max(64),
  lines: z.array(z.object({ variantId: z.string(), qty: z.number().int().min(1).max(10) })).min(1).max(30),
});

checkout.post("/orders", requireUser, async (req, res) => {
  const b = placeBody.parse(req.body);
  if (b.method === "COD" && process.env.COD_ENABLED === "false") throw new AppError("COD_OFF", "Cash on delivery is unavailable", 400);
  res.status(201).json(await placeOrder({ ...b, userId: res.locals.userId }));
});

const orderView = { items: true, payment: { select: { method: true, status: true } }, history: { select: { toStatus: true, createdAt: true }, orderBy: { createdAt: "asc" as const } } };

checkout.get("/orders", requireUser, async (_req, res) => {
  res.json(await prisma.order.findMany({ where: { userId: res.locals.userId }, orderBy: { createdAt: "desc" }, include: orderView }));
});
checkout.get("/orders/:id", requireUser, async (req, res) => {
  const o = await prisma.order.findFirst({ where: { id: req.params.id, userId: res.locals.userId }, include: orderView }); // ownership in the query
  if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
  res.json(o);
});
checkout.post("/orders/:id/cancel", requireUser, async (req, res) => {
  await cancelOrder(req.params.id, res.locals.userId, "Cancelled by customer", res.locals.userId);
  res.json({ ok: true });
});

checkout.post("/payments/create", requireUser, async (req, res) => {
  const { orderId } = z.object({ orderId: z.string() }).parse(req.body);
  res.json(await createGatewayOrder(orderId, res.locals.userId));
});

checkout.post("/payments/verify", requireUser, async (req, res) => {
  const b = z.object({ razorpay_order_id: z.string(), razorpay_payment_id: z.string(), razorpay_signature: z.string() }).parse(req.body);
  if (!verifyCheckoutSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) throw new AppError("BAD_SIGNATURE", "Payment could not be verified", 400);
  const mine = await prisma.payment.findFirst({ where: { gatewayOrderId: b.razorpay_order_id, order: { userId: res.locals.userId } } });
  if (!mine) throw new AppError("NOT_FOUND", "Payment not found", 404);
  try {
    await confirmPayment(b.razorpay_order_id, b.razorpay_payment_id);
    res.json({ status: "paid" });
  } catch (e) {
    if (e instanceof AppError && e.code === "NOT_CAPTURED") return res.status(202).json({ status: "pending" }); // webhook will finalize
    throw e;
  }
});

checkout.post("/payments/webhook", async (req, res) => {
  const sig = req.header("x-razorpay-signature") ?? "";
  if (!Buffer.isBuffer(req.body) || !verifyWebhookSignature(req.body, sig)) return res.status(400).end();
  const ev = JSON.parse(req.body.toString("utf8"));
  const p = ev.payload?.payment?.entity;
  try {
    if (ev.event === "payment.captured" && p) await confirmPayment(p.order_id, p.id);
    if (ev.event === "payment.failed" && p) await markPaymentFailed(p.order_id);
  } catch (e) {
    if (!(e instanceof AppError)) throw e; // unknown/mismatched payments: acknowledge so the gateway stops retrying
  }
  res.json({ ok: true });
});
