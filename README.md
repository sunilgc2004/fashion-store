# Fashion store: order & payment core (step 1 of the build)

This is the part of the system that is hardest to get right: database schema, stock-safe order placement,
payment verification, and order status rules. The React storefront, admin UI, auth, and the rest of the
spec still need to be built on top of it.

## What is here
- `server/prisma/schema.prisma`: all models; money as integer paise; order-item snapshots; idempotency key on orders.
- `server/src/services/orders.ts`: `placeOrder` (server-side pricing, atomic stock guard, idempotent),
  `cancelOrder` (restores stock), `adminSetStatus` (enforced transitions), `releaseExpiredOrders` (15-min hold).
- `server/src/services/payments.ts`: Razorpay order creation, checkout + webhook signature checks,
  `confirmPayment` (exactly-once), `recordCodCollection`.

## Not built yet
Express app and routes, auth/RBAC, password reset, catalogue/admin CRUD, cart, React UI, image upload,
email notification sender, reports, tests, seed data, deployment docs. Refunds for cancelled paid orders are manual
(a `REFUND_NEEDED` notification is raised only for late payments).

## Status: not yet run
Written but not installed, compiled or tested. First steps:
```
cd server && npm init -y
npm i @prisma/client razorpay && npm i -D prisma typescript vitest @types/node
cp .env.example .env   # fill in Razorpay TEST keys
npx prisma migrate dev --name init
```
Add `ALTER TABLE "ProductVariant" ADD CONSTRAINT stock_nonneg CHECK (stock >= 0);` to the first migration.
Assumes Razorpay auto-capture is on (payment status `captured`). Tax is not modelled; add GST rules once confirmed.

## Step 2: shopper portal (API + storefront)
API: `server/src/app.ts` + `routes/{auth,shop,checkout}.ts` (register/login/logout via httpOnly cookie, catalogue with
search/filter/sort/pagination, cart quote, addresses, orders, payments, webhook). Storefront: `web/src/` (catalogue,
product, cart, checkout with Razorpay, login/register). Cart lives in the browser; the server re-prices at checkout.

Extra setup (still not run):
```
cd server && npm i express@5 helmet cookie-parser express-rate-limit argon2 jsonwebtoken zod dotenv
npm i -D @types/express @types/cookie-parser @types/jsonwebtoken tsx && npx tsx src/index.ts
npm create vite@latest web -- --template react-ts   # then copy this web/src over its src and vite.config.ts
cd web && npm i react-router-dom && npm i -D tailwindcss @tailwindcss/vite && npm run dev
```
Razorpay webhook (test mode): point it at `/api/payments/webhook` with events `payment.captured` and `payment.failed`.

Still missing on the shopper side: order history/detail pages (API exists), forgot/reset password, profile and
address editing, home hero/featured sections, price/size/colour filter UI (API supports them), sale-price-aware
sort, server-side cart for logged-in users, tests.

## Step 3: admin portal (API + UI at `/admin`)
API: `server/src/routes/admin.ts`. Admin login is separate (`/api/admin/login`, 8-hour session, 10 tries/15 min); every
other admin route checks the user's role in the database on each request. Dashboard figures are live queries.
Create the first admin once, from the server: `ADMIN_EMAIL=... ADMIN_PASSWORD='12+ chars' npx tsx scripts/create-admin.ts`
(refuses to run if an admin already exists; no default account).
UI: `web/src/admin/` (dashboard, orders with status actions + COD collection, products with stock adjustment, categories).

Missing on the admin side: editing a product's name/price/images in the UI (API supports it), image upload (images are
HTTPS URLs for now, Cloudinary not wired), category edit/deactivate UI, customers page, reports + CSV, admin email notification
(unread badge works), stock-restoring refunds, tests. Replace the plain `prompt()` stock dialog with a proper form later.

> Setup commands in earlier sections are superseded by RUN_AND_DEPLOY.md (package.json files now included).
