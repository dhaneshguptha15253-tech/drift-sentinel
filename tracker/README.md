# Drift Sentinel – Tracker

A tiny browser-side **JS Proxy** that transparently records which JSON fields
your app actually reads, then ships those "read reports" to the observer.

---

## What it does

When you wrap an API response with `track()`, every property access is
intercepted and recorded as a **dot-path** (e.g. `address.city`,
`orders[].total`).  Nested objects and arrays are wrapped lazily, so only
genuinely-read fields show up.

Fields accessed via `.length`, array methods (`map`, `forEach`, …), or through
`raw()` are **not** counted.

---

## One-line setup

```js
import { initTracker, track, raw, flush } from "../tracker/tracker.js";

// 1. Initialise once (call before any track())
initTracker({
  client:    "web",          // name of this client
  version:   "1",            // API schema version being used
  reportUrl: "/reports",     // observer endpoint (leave "" to console.log)
  flushMs:   5000,           // how often to send reports (ms)
  strict:    false,          // set true to flag unexpected extra reads
});

// 2. Wrap every API response you receive
const user = track(await res.json(), "GET /users/:id");

// 3. Use the wrapped object normally – reads are recorded automatically
console.log(user.address.city);
```

---

## API reference

| Export | Signature | Description |
|---|---|---|
| `initTracker` | `(opts) → void` | Configure and start the interval flush. |
| `track` | `(data, label) → Proxy` | Wrap an API response object. |
| `raw` | `(proxy) → object` | Unwrap to plain object (use before `JSON.stringify` or spread). |
| `flush` | `() → Promise<void>` | Send pending reads to the observer immediately. |
| `_peek` | `() → {endpoint, path}[]` | Inspect pending reads without flushing (tests only). |

> **Important:** call `raw()` before `JSON.stringify(user)` or `{ ...user }`.
> Spreading or stringifying a Proxy will trigger a read of *every* field,
> polluting the report.  Example:
>
> ```js
> const plain = raw(user);          // unwrap first
> console.log(JSON.stringify(plain)); // safe – not counted
> ```

---

## Running the tests

```bash
node tracker/tracker.test.mjs
```

Exits `0` on pass, `1` on failure.  No build step required.

---

## Notes

- The tracker has **no runtime dependencies** – pure ES module.
- Reports are batched and sent on `pagehide` (tab close) and every `flushMs`.
- If a POST fails, reads are re-queued for the next flush.
