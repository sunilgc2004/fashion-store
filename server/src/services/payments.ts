import crypto from "crypto";
import Razorpay from "razorpay";
import { prisma } from "../db";
import { AppError, transition } from "./orders";

const rzp = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID!, key_secret: process.env.RAZORPAY_KEY_SECRET! });

const hmac = (secret: string, data: string | Buffer) => crypto.createHmac("sha256", secret).update(data).digest("hex");
const safeEq = (a: string, b: string) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Browser callback: HMAC of "gatewayOrderId|paymentId" with the key secret. */
export const verifyCheckoutSignature = (gatewayOrderId: string, paymentId: string, sig: string) =>
  safeEq(hmac(process.env.RAZORPAY_KEY_SECRET!, `${gatewayOrderId}|${paymentId}`), sig);

/** Webhook: HMAC of the RAW request body (use express.raw, not express.json, on this route). */
export const verifyWebhookSignature = (rawBody: Buffer, sig: string) =>
  safeEq(hmac(process.env.RAZORPAY_WEBHOOK_SECRET!, rawBody), sig);

export async function createGatewayOrder(orderId: string, userId: string) {
  const order = await prisma.order.findFirst({ where: { id: orderId, userId, status: "PENDING_PAYMENT" }, include: { payment: true } });
  if (!order?.payment) throw new AppError("NOT_FOUND", "Order is not awaiting payment", 404);
  if (order.reservedUntil && order.reservedUntil < new Date()) throw new AppError("EXPIRED", "Payment window expired", 410);

  let gatewayOrderId = order.payment.gatewayOrderId;
  if (!gatewayOrderId) {
    // amount comes from our DB, never from the client; reused on refresh/retry
    const g = await rzp.orders.create({ amount: order.totalPaise, currency: "INR", receipt: order.orderNumber });
    gatewayOrderId = g.id;
    await prisma.payment.update({ where: { id: order.payment.id }, data: { gatewayOrderId } });
  }
  return { gatewayOrderId, amount: order.totalPaise, currency: "INR", keyId: process.env.RAZORPAY_KEY_ID };
}

/**
 * Call from BOTH the verified browser callback and the verified webhook. Safe to call repeatedly:
 * only the first caller moves PENDING -> PAID and PENDING_PAYMENT -> PLACED.
 */
export async function confirmPayment(gatewayOrderId: string, paymentId: string) {
  const g = await rzp.payments.fetch(paymentId); // server-to-server status check, not the frontend's word
  const pay = await prisma.payment.findUnique({ where: { gatewayOrderId } });
  if (!pay) throw new AppError("NOT_FOUND", "Unknown payment", 404);
  if (g.order_id !== gatewayOrderId || g.status !== "captured" || Number(g.amount) !== pay.amountPaise)
    throw new AppError("NOT_CAPTURED", "Payment not confirmed", 402);

  return prisma.$transaction(async (tx) => {
    const won = await tx.payment.updateMany({
      where: { id: pay.id, status: { in: ["PENDING", "FAILED"] } },
      data: { status: "PAID", gatewayPaymentId: paymentId, paidAt: new Date() },
    });
    if (won.count !== 1) return { duplicate: true };
    const o = await tx.order.findUniqueOrThrow({ where: { id: pay.orderId } });
    if (o.status === "PENDING_PAYMENT") {
      await transition(tx, o.id, o.status, "PLACED", null, "Payment verified");
      await tx.notification.create({ data: { type: "NEW_ORDER", orderId: o.id } });
    } else {
      // money arrived after the order expired/cancelled: flag for a manual refund
      await tx.notification.create({ data: { type: "REFUND_NEEDED", orderId: o.id } });
    }
    return { duplicate: false };
  });
}

export const markPaymentFailed = (gatewayOrderId: string) =>
  prisma.payment.updateMany({ where: { gatewayOrderId, status: "PENDING" }, data: { status: "FAILED" } });

export async function recordCodCollection(orderId: string, adminId: string) {
  await prisma.$transaction(async (tx) => {
    const r = await tx.payment.updateMany({
      where: { orderId, method: "COD", status: "PENDING", order: { status: "DELIVERED" } },
      data: { status: "PAID", paidAt: new Date(), collectedById: adminId },
    });
    if (r.count !== 1) throw new AppError("NOT_COLLECTIBLE", "Only delivered, unpaid COD orders can be marked collected", 409);
    await tx.auditLog.create({ data: { actorId: adminId, action: "COD_COLLECTED", entity: "Order", entityId: orderId } });
  });
}
