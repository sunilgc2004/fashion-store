# Run and deploy: step by step

Status: this code has never been run. Expect to fix a few small errors on first start. Do not take real payments
until you have completed every test-mode check in section C.

## A. Run on your computer
Needs: Node 20+ and either Docker or PostgreSQL 15+.

1. Unzip and open a terminal in the `fashion-store` folder.
2. Start a database (Docker):
   `docker run --name shopdb -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=fashion_store -p 5432:5432 -d postgres:16`
3. Set up the API:
   ```
   cd server
   cp .env.example .env
   ```
   Edit `.env`: `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/fashion_store`; set `JWT_SECRET` to a long random
   value (`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`); paste your Razorpay TEST key id and secret
   (Razorpay dashboard, test mode). Then `npm install`.
4. Create the tables:
   `npx prisma migrate dev --name init`
   Then add the stock safety rule as a second migration. In `prisma/migrations/` create a folder named
   `20261015080000_stock_check` (its number must be higher than the `init` folder's). Inside it create a file
   `migration.sql` containing only this line, save, and run `npx prisma migrate dev` again:
   `ALTER TABLE "ProductVariant" ADD CONSTRAINT "stock_nonneg" CHECK ("stock" >= 0);`
5. Optional sample products: `npm run db:seed`
6. Create your admin login (one time; use your own email and a 12+ character password):
   - Mac/Linux: `ADMIN_EMAIL=you@yourshop.com ADMIN_PASSWORD='your long passphrase' npm run admin:create`
   - Windows PowerShell: `$env:ADMIN_EMAIL="you@yourshop.com"; $env:ADMIN_PASSWORD="your long passphrase"; npm run admin:create`
7. Start the API: `npm run dev` (leave it running).
8. In a second terminal: `cd web && npm install && npm run dev`
9. Open http://localhost:5173 (shop) and http://localhost:5173/admin (admin).

## B. Deploy (one service for API + storefront; works on Render, Railway or similar)
1. Put the project in a private GitHub repo. The `server/prisma/migrations` folder created in step A4 MUST be included;
   `.env` must not be (it is git-ignored).
2. Create a managed PostgreSQL database with the host (or Neon/Supabase) and copy its connection string.
3. Create a Web Service from the repo (Node 20+):
   - Build command: `npm run build`
   - Start command: `npm start` (applies migrations, then starts the server; it also serves the built storefront)
4. Add environment variables: `NODE_ENV=production`, `DATABASE_URL`, `JWT_SECRET` (a new random value, not your dev one),
   `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `COD_ENABLED`, `SHIPPING_PAISE`, `FREE_SHIPPING_ABOVE_PAISE`.
   Use Razorpay TEST keys first.
5. Deploy, then open the service URL. Create the production admin once, from the host's shell or from your computer with the
   production `DATABASE_URL` set: `cd server && ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:create`.
   Never run the seed in production.
6. Razorpay (test mode): Settings > Webhooks > add `https://YOUR-URL/api/payments/webhook`, events `payment.captured` and
   `payment.failed`, and put the same secret you chose into `RAZORPAY_WEBHOOK_SECRET`.
7. Add your custom domain in the host's settings (HTTPS is provided by the host).
8. Turn on automatic database backups and test one restore.

## C. Before going live: test in test mode
- Register, browse, search, add to cart, check out with COD; confirm it appears in /admin with the unread badge.
- Check out with online payment using Razorpay's test payment details; confirm the order moves to "Placed" and shows PAID.
  If the payment window does not open, open the browser console: a "Content Security Policy" message means a Razorpay address
  must be added in `server/src/app.ts` (helmet settings).
- Close the payment window midway, retry: you must get one order, not two.
- Order the last unit from two browsers at once: only one may succeed.
- Admin: confirm, process, ship, deliver; record COD collection; cancel an order and check stock returns.
- A customer account must get "Not allowed" on /api/admin routes.
Then: finish Razorpay account verification, switch to live keys, repeat one small real order, and refund it.

## Known gaps (see README)
No automated tests, product image upload, order-history pages for customers, password reset, reports/CSV, admin email alerts,
GST/tax handling, or automatic refunds. Add GST rules and legal pages (privacy, returns, terms) before launch.

## Troubleshooting
- `Can't reach database server`: database not running or wrong DATABASE_URL.
- Login works but you get logged out / 401: use the same address for shop and API (localhost:5173 in dev; one URL in production).
- `JWT_SECRET is not set`: `.env` missing in `server/`.
