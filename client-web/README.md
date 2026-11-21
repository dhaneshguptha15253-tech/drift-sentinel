# Drift Sentinel – Web Client

Demo browser client that uses the tracker to record which fields each API
version reads.

---

## Running locally

Serve the **repo root** (not `client-web/`) so the ES module import path
`../tracker/tracker.js` resolves correctly.

```bash
# From the repo root
npx http-server . -p 3000 -c-1
```

Then open one of these URLs in your browser:

| URL | What you see |
|---|---|
| `http://localhost:3000/client-web/?v=1` | v1 layout – reads `user_name`, `email`, `address.city`, `orders[0].total` |
| `http://localhost:3000/client-web/?v=2` | v2 layout – reads `email`, `plan`, `joined_at`, `address.city` |
| `http://localhost:3000/client-web/?v=1&strict=1` | v1 in **strict mode** (banner shows `[strict]`, report flag set) |
| `http://localhost:3000/client-web/?v=2&strict=1` | v2 in **strict mode** |

> The `-c-1` flag disables http-server's cache so you always get fresh files.

---

## Fields read per version

| Field | v1 | v2 |
|---|---|---|
| `user_name` | ✅ | — |
| `email` | ✅ | ✅ |
| `address.city` | ✅ | ✅ |
| `orders[0].total` | ✅ | — |
| `plan` | — | ✅ |
| `joined_at` | — | ✅ |

Fields not in the table (`legacy_flag`, etc.) are never read by either version.

---

## Query parameters

| Param | Values | Effect |
|---|---|---|
| `v` | `1` (default) or `2` | Selects which field set to render. |
| `strict` | `1` | Passes `strict: true` to `initTracker`; the observer uses this to warn on unexpected reads. |

---

## Mock data

`mock/user.json` is the local stand-in for the real API.  It contains both v1
and v2 fields so either layout can render without a live backend.

When `CONFIG.API_URL` in `config.js` is updated to point to Person B's demo
API, the mock is bypassed automatically.
