import "dotenv/config"; // must be first: other modules read env at import time
import { app } from "./app";
import { releaseExpiredOrders } from "./services/orders";

app.listen(Number(process.env.PORT ?? 4000), () => console.log("API listening"));
// frees stock held by unpaid online orders (safe to run on several instances)
setInterval(() => releaseExpiredOrders().catch((e) => console.error("release failed", e)), 60_000);
