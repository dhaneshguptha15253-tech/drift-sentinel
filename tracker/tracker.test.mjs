import { initTracker, track, flush, _peek } from "./tracker.js";

initTracker({ client: "web", version: "1" });

const data = track(
  { user_name: "a", email: "a@x.com", address: { city: "Pune" }, orders: [{ total: 5 }, { total: 9 }] },
  "GET /users/:id"
);

data.user_name;
data.address.city;
data.orders[0].total;
data.orders.length;

console.log(_peek().map((r) => r.path));
process.exit(0);
