/**
 * tracker.test.mjs
 *
 * Unit test for tracker.js.
 * Runs with: node tracker/tracker.test.mjs
 * Exits 0 on pass, 1 on failure.
 */

import { initTracker, track, _peek } from "./tracker.js";

// ── Setup ────────────────────────────────────────────────────────────────────
initTracker({ client: "web", version: "1" });

const data = track(
  {
    user_name: "a",
    email: "a@x.com",
    address: { city: "Pune" },
    orders: [{ total: 5 }, { total: 9 }],
  },
  "GET /users/:id"
);

// ── Exercise every path that SHOULD be recorded ───────────────────────────────
data.user_name;         // → "user_name"
data.address.city;      // → "address", then "address.city"
data.orders[0].total;   // → "orders", then "orders[]", then "orders[].total"
data.orders[1].total;   // → same paths (de-duped by Map key)
data.orders.length;     // array.length – should NOT be recorded
// data.email is intentionally NOT read

// ── Collect recorded paths ────────────────────────────────────────────────────
const recorded = new Set(_peek().map((r) => r.path));
console.log("Recorded paths:", [...recorded]);

// ── Assertion helper ──────────────────────────────────────────────────────────
let failed = 0;

function expect_present(path) {
  if (!recorded.has(path)) {
    console.error(`FAIL  expected path recorded: "${path}"`);
    failed++;
  } else {
    console.log(`PASS  path recorded:     "${path}"`);
  }
}

function expect_absent(path) {
  if (recorded.has(path)) {
    console.error(`FAIL  expected path NOT recorded: "${path}"`);
    failed++;
  } else {
    console.log(`PASS  path NOT recorded: "${path}"`);
  }
}

// ── Assertions: paths that MUST be recorded ───────────────────────────────────
expect_present("user_name");
expect_present("address");
expect_present("address.city");
expect_present("orders");
expect_present("orders[].total");

// ── Assertions: paths that must NOT be recorded ───────────────────────────────
expect_absent("email");   // never read
expect_absent("length");  // array.length is excluded by the proxy

// ── Result ────────────────────────────────────────────────────────────────────
if (failed === 0) {
  console.log("\nAll tests passed ✓");
  process.exit(0);
} else {
  console.error(`\n${failed} test(s) failed ✗`);
  process.exit(1);
}
