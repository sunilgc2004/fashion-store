import path from "path";
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import { ZodError } from "zod";
import { auth } from "./routes/auth";
import { shop } from "./routes/shop";
import { admin } from "./routes/admin";
import { Prisma } from "@prisma/client";
import { checkout } from "./routes/checkout";
import { AppError } from "./services/orders";

export const app = express();
app.set("trust proxy", 1); // behind the host's proxy: correct client IPs for rate limiting
app.use(helmet({ contentSecurityPolicy: { directives: {
  ...helmet.contentSecurityPolicy.getDefaultDirectives(),
  "script-src": ["'self'", "https://checkout.razorpay.com"],
  "frame-src": ["https://api.razorpay.com", "https://checkout.razorpay.com"],
  "connect-src": ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com"],
  "img-src": ["'self'", "data:", "https:"],
} } }));
app.use("/api/payments/webhook", express.raw({ type: "application/json" })); // raw body needed for the signature check
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());
app.use("/api/auth", rateLimit({ windowMs: 15 * 60_000, limit: 30 }), auth);
app.use("/api/admin", admin);
app.use("/api", shop);
app.use("/api", checkout);

if (process.env.NODE_ENV === "production") {
  // one service serves API + built storefront, so cookies stay same-origin
  const dist = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(dist));
  app.use((req, res, next) => (req.method === "GET" && !req.path.startsWith("/api") ? res.sendFile(path.join(dist, "index.html")) : next()));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof AppError) return res.status(err.status).json({ error: err.code, message: err.message });
  if (err instanceof ZodError) return res.status(400).json({ error: "VALIDATION", message: err.issues[0]?.message ?? "Invalid input" });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return res.status(409).json({ error: "DUPLICATE", message: "That value (name, slug or SKU) already exists" });
  console.error(err);
  res.status(500).json({ error: "SERVER", message: "Something went wrong" });
});
