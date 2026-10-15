// One-time setup, run by whoever controls the server (no default admin account exists):
//   ADMIN_EMAIL=owner@yourshop.com ADMIN_PASSWORD='a long passphrase' npx tsx scripts/create-admin.ts
import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../src/db";

async function main() {
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const pw = process.env.ADMIN_PASSWORD;
  if (!email || !pw || pw.length < 12) throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD (at least 12 characters).");
  if (await prisma.user.count({ where: { role: "ADMIN" } })) throw new Error("An admin already exists; refusing to create another.");
  const passwordHash = await argon2.hash(pw);
  await prisma.user.upsert({ where: { email }, update: { role: "ADMIN", passwordHash }, create: { email, name: "Admin", passwordHash, role: "ADMIN" } });
  console.log(`Admin ready: ${email}`);
}
main().catch((e) => { console.error(e.message); process.exit(1); }).finally(() => prisma.$disconnect());
