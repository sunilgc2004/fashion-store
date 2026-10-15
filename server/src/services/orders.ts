import { Prisma, OrderStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { prisma } from "../db";

export class AppError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

type Tx = Prisma.TransactionClient;

export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING_PAYMENT: ["PLACED", "CANCELLED"], // PLACED only via verified payment, never via admin
  PLACED: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
};

const RESERVE_MINUTES = 15;
const orderNumber = () => `ORD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
export const shippingFor = (subtotal: number) =>
  subtotal >= Number(process.env.FREE_SHIPPING_ABOVE_PAISE ?? 199900) ? 0 : Number(process.env.SHIPPING_PAISE ?? 9900);

/** Compare-and-set status change: if two requests race, exactly one wins. */
export async function transition(tx: Tx, orderId: string, from: OrderStatus, to: OrderStatus, actorId: string | null, note?: string) {
  if (!TRANSITIONS[from].includes(to)) throw new AppError("BAD_TRANSITION", `${from} -> ${to} is not allowed`, 409);
  const r = await tx.order.updateMany({ where: { id: orderId, status: from }, data: { status: to, reservedUntil: null } });
  if (r.count !== 1) throw new AppError("STALE_STATUS", "Order changed; reload and retry", 409);
  await tx.orderStatusHistory.create({ data: { orderId, fromStatus: from, toStatus: to, actorId, note } });
}

/** Prices, availability and totals all come from the DB; the client only sends variant ids + quantities. */
export async function placeOrder(input: {
  userId: string;
  addressId: string;
  method: "ONLINE" | "COD";
  idempotencyKey: string;
  lines: { variantId: string; qty: number }[];
}) {
  const find = () =>
    prisma.order.findUnique({
      where: { userId_idempotencyKey: { userId: input.userId, idempotencyKey: input.idempotencyKey } },
      include: { items: true, payment: true },
    });
  const prior = await find(); // double-click / refresh / retry returns the same order
  if (prior) return prior;

  const qtyByVariant = new Map<string, number>();
  for (const l of input.lines) {
    if (!Number.isInteger(l.qty) || l.qty < 1 || l.qty > 10) throw new AppError("BAD_QTY", "Quantity must be 1-10");
    qtyByVariant.set(l.variantId, (qtyByVariant.get(l.variantId) ?? 0) + l.qty);
  }
  if (!qtyByVariant.size) throw new AppError("EMPTY_CART", "Cart is empty");

  try {
    return await prisma.$transaction(async (tx) => {
      const addr = await tx.address.findFirst({ where: { id: input.addressId, userId: input.userId } }); // ownership check
      if (!addr) throw new AppError("BAD_ADDRESS", "Address not found", 404);
      const { id: _id, userId: _uid, ...shipTo } = addr;

      let subtotal = 0;
      const items: Prisma.OrderItemCreateWithoutOrderInput[] = [];
      // fixed lock order avoids deadlocks between concurrent checkouts
      for (const [variantId, qty] of [...qtyByVariant].sort(([a], [b]) => a.localeCompare(b))) {
        const v = await tx.productVariant.findFirst({
          where: { id: variantId, product: { published: true, category: { active: true } } },
          include: { product: true },
        });
        if (!v) throw new AppError("UNAVAILABLE", "An item is no longer available", 409);
        // The UPDATE only matches while enough stock remains -> no overselling under concurrency.
        const r = await tx.productVariant.updateMany({ where: { id: variantId, stock: { gte: qty } }, data: { stock: { decrement: qty } } });
        if (r.count !== 1) throw new AppError("OUT_OF_STOCK", `${v.product.name} is out of stock`, 409);
        const unit = v.product.salePricePaise ?? v.product.pricePaise;
        subtotal += unit * qty;
        items.push({
          variant: { connect: { id: variantId } },
          productName: v.product.name,
          variantLabel: [v.size, v.colour].filter(Boolean).join(" / "),
          unitPricePaise: unit,
          qty,
        });
      }

      const shipping = shippingFor(subtotal);
      const total = subtotal + shipping;
      const cod = input.method === "COD";
      const status: OrderStatus = cod ? "PLACED" : "PENDING_PAYMENT";
      const order = await tx.order.create({
        data: {
          orderNumber: orderNumber(),
          userId: input.userId,
          idempotencyKey: input.idempotencyKey,
          status,
          shipTo,
          subtotalPaise: subtotal,
          shippingPaise: shipping,
          totalPaise: total,
          reservedUntil: cod ? null : new Date(Date.now() + RESERVE_MINUTES * 60_000),
          items: { create: items },
          payment: { create: { method: input.method, amountPaise: total } },
          history: { create: { toStatus: status, actorId: input.userId } },
        },
        include: { items: true, payment: true },
      });
      if (cod) await tx.notification.create({ data: { type: "NEW_ORDER", orderId: order.id } });
      return order;
    });
  } catch (e) {
    // two identical requests raced past the first check: the unique key stopped the second
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const again = await find();
      if (again) return again;
    }
    throw e;
  }
}

/** Cancels and restores stock in one transaction. Refunds for paid online orders are NOT automated. */
export async function cancelOrder(orderId: string, actorId: string | null, note: string, ownerId?: string) {
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findFirst({ where: { id: orderId, ...(ownerId ? { userId: ownerId } : {}) }, include: { items: true } });
    if (!o) throw new AppError("NOT_FOUND", "Order not found", 404);
    if (ownerId && !["PENDING_PAYMENT", "PLACED", "CONFIRMED"].includes(o.status))
      throw new AppError("NOT_CANCELLABLE", "This order can no longer be cancelled by the customer", 409);
    await transition(tx, o.id, o.status, "CANCELLED", actorId, note);
    for (const i of o.items) await tx.productVariant.update({ where: { id: i.variantId }, data: { stock: { increment: i.qty } } });
  });
}

export async function adminSetStatus(orderId: string, to: OrderStatus, adminId: string) {
  if (to === "CANCELLED") return cancelOrder(orderId, adminId, "Cancelled by admin");
  return prisma.$transaction(async (tx) => {
    const o = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (o.status === "PENDING_PAYMENT") throw new AppError("AWAITING_PAYMENT", "Order is awaiting payment", 409);
    await transition(tx, o.id, o.status, to, adminId);
    await tx.auditLog.create({ data: { actorId: adminId, action: "ORDER_STATUS", entity: "Order", entityId: o.id, meta: { from: o.status, to } } });
  });
}

/** Run every minute (cron/worker): frees stock held by unpaid online orders. */
export async function releaseExpiredOrders(now = new Date()) {
  const stale = await prisma.order.findMany({ where: { status: "PENDING_PAYMENT", reservedUntil: { lt: now } }, select: { id: true } });
  for (const { id } of stale) {
    try {
      await cancelOrder(id, null, "Payment window expired");
    } catch (e) {
      if (!(e instanceof AppError)) throw e; // lost a race with a payment confirmation: fine
    }
  }
}
