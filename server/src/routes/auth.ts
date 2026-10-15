import { NextFunction, Request, Response, Router } from "express";
import argon2 from "argon2";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { prisma } from "../db";
import { AppError } from "../services/orders";

export const auth = Router();
const SECRET = process.env.JWT_SECRET ?? (() => { throw new Error("JWT_SECRET is not set"); })();
const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", maxAge: 7 * 24 * 3600_000 };
export const issue = (res: Response, id: string, hours = 168) =>
  res.cookie("sid", jwt.sign({ sub: id }, SECRET, { expiresIn: `${hours}h` }), { ...cookie, maxAge: hours * 3600_000 });

/** Sets res.locals.userId. Roles are always read from the DB, never from the token. */
export function requireUser(req: Request, res: Response, next: NextFunction) {
  try {
    res.locals.userId = (jwt.verify(req.cookies?.sid, SECRET) as jwt.JwtPayload).sub;
    next();
  } catch {
    next(new AppError("UNAUTHENTICATED", "Please log in", 401));
  }
}

const creds = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(8).max(100) });

auth.post("/register", async (req, res) => {
  const b = creds.extend({ name: z.string().trim().min(1).max(80), phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a 10-digit mobile number").optional() }).parse(req.body);
  if (await prisma.user.findUnique({ where: { email: b.email } })) throw new AppError("EMAIL_TAKEN", "An account with this email exists", 409);
  const u = await prisma.user.create({ data: { email: b.email, name: b.name, phone: b.phone, passwordHash: await argon2.hash(b.password) } }); // role defaults to CUSTOMER
  issue(res, u.id);
  res.status(201).json({ name: u.name });
});

auth.post("/login", async (req, res) => {
  const b = creds.parse(req.body);
  const u = await prisma.user.findUnique({ where: { email: b.email } });
  if (!u || !(await argon2.verify(u.passwordHash, b.password))) throw new AppError("BAD_LOGIN", "Invalid email or password", 401);
  issue(res, u.id);
  res.json({ name: u.name });
});

auth.post("/logout", (_req, res) => res.clearCookie("sid").json({ ok: true }));

auth.get("/me", requireUser, async (_req, res) => {
  res.json(await prisma.user.findUniqueOrThrow({ where: { id: res.locals.userId }, select: { name: true, email: true, phone: true } }));
});
